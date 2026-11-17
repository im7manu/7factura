// Crea el instalador de Windows: release/Facturador-Instalador-Windows.exe (y su .sha256).
// Contiene el mismo paquete firmado de la Release (release/facturador-<versión>.tar.gz, generado antes con
// `npm run release`), Node.js para Windows y el lanzador Facturador.exe (windows/lanzador, en Go).
// Necesita: go, makensis (NSIS), tar, unzip. Funciona en macOS y Linux (también en GitHub Actions).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NODE_VERSION = '22.23.5'; // Node.js LTS que se incluye (debe cumplir "engines" de package.json)
const raiz = path.resolve('.');
const version = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).version;
const salida = path.join(raiz, 'release');
const paquete = path.join(salida, `facturador-${version}.tar.gz`);
const instalador = path.join(salida, 'Facturador-Instalador-Windows.exe');
const cache = path.join(os.homedir(), '.cache', 'facturador-windows');
const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'facturador-windows-'));
const origen = path.join(trabajo, 'origen');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });

if (!fs.existsSync(paquete)) {
  console.error(`No existe ${path.relative(raiz, paquete)}. Genera antes el paquete con: npm run release`);
  process.exit(1);
}
fs.mkdirSync(cache, { recursive: true });
fs.mkdirSync(origen, { recursive: true });

// 1. Aplicación: el paquete de la Release tal cual
console.log(`Facturador ${version} para Windows`);
run('tar', ['-xzf', paquete, '-C', trabajo]);
fs.renameSync(path.join(trabajo, 'facturador'), path.join(origen, 'app'));

// 2. Node.js para Windows, verificado con la suma SHA-256 oficial
const zipNombre = `node-v${NODE_VERSION}-win-x64.zip`;
const zip = path.join(cache, zipNombre);
const base = `https://nodejs.org/dist/v${NODE_VERSION}`;
const sumas = await (await fetch(`${base}/SHASUMS256.txt`)).text();
const esperado = sumas.split('\n').find((l) => l.endsWith(`  ${zipNombre}`))?.split(/\s+/)[0];
if (!esperado) throw new Error(`No se encuentra la suma de ${zipNombre}`);
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if (!fs.existsSync(zip) || sha(zip) !== esperado) {
  console.log(`Descargando ${zipNombre}…`);
  const r = await fetch(`${base}/${zipNombre}`);
  if (!r.ok) throw new Error(`No se pudo descargar Node.js (${r.status})`);
  fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
  if (sha(zip) !== esperado) throw new Error('La suma SHA-256 de Node.js no coincide');
}
const dirNode = path.join(origen, 'node');
fs.mkdirSync(dirNode);
const carpeta = `node-v${NODE_VERSION}-win-x64`;
run('unzip', ['-q', '-j', zip, `${carpeta}/node.exe`, `${carpeta}/LICENSE`, '-d', dirNode]);

// 3. Lanzador (Go, compilado para Windows con icono y manifiesto)
const dirLanzador = path.join(raiz, 'windows', 'lanzador');
run('go', ['run', 'github.com/akavel/rsrc@v0.10.2', '-arch', 'amd64', '-ico', path.join(raiz, 'windows', 'facturador.ico'),
  '-manifest', 'facturador.manifest', '-o', 'rsrc_windows_amd64.syso'], { cwd: dirLanzador });
run('go', ['build', '-trimpath', '-ldflags', `-H windowsgui -s -w -X main.version=${version}`, '-o', path.join(origen, 'Facturador.exe'), '.'], {
  cwd: dirLanzador, env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' },
});

// 4. Instalador (NSIS)
const tamano = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((t, e) => {
  const p = path.join(d, e.name);
  return t + (e.isDirectory() ? tamano(p) : fs.statSync(p).size);
}, 0);
fs.mkdirSync(salida, { recursive: true });
run('makensis', ['-V2', '-INPUTCHARSET', 'UTF8', `-DVERSION=${version}`, `-DORIGEN=${origen}`, `-DSALIDA=${instalador}`, `-DRAIZ=${raiz}`,
  `-DTAMANO_KB=${Math.round(tamano(origen) / 1024)}`, path.join(raiz, 'windows', 'instalador.nsi')]);
fs.writeFileSync(`${instalador}.sha256`, `${sha(instalador)}  ${path.basename(instalador)}\n`);
fs.rmSync(trabajo, { recursive: true, force: true });
console.log(`Listo: ${path.relative(raiz, instalador)} (${(fs.statSync(instalador).size / 1048576).toFixed(1)} MB)`);
