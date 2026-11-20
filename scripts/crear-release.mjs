// Crea el paquete de una versión: release/facturador-<versión>.tar.gz y su firma .sig.
// Incluye el código del servidor, la interfaz compilada (dist/) y las dependencias de producción.
// La clave privada se lee de FACTURADOR_CLAVE_FIRMA (contenido PEM, p. ej. desde un secreto de GitHub)
// o de ~/.facturador/clave-firma-actualizaciones.pem.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const raiz = path.resolve('.');
const pk = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
const version = pk.version;
const salida = path.join(raiz, 'release');
const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'facturador-release-'));
const destino = path.join(trabajo, 'facturador');

console.log(`Preparando 7Factura ${version}…`);
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
fs.mkdirSync(destino, { recursive: true });
for (const f of ['server', 'shared', 'scripts', 'dist', 'docs', 'examples', 'package.json', 'package-lock.json', 'LICENSE', 'README.md', 'Dockerfile', 'docker-compose.yml']) {
  if (fs.existsSync(path.join(raiz, f))) fs.cpSync(path.join(raiz, f), path.join(destino, f), { recursive: true, filter: (s) => !s.includes(`${path.sep}test${path.sep}`) && !s.endsWith(`${path.sep}test`) });
}
execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: destino, stdio: 'inherit' });
fs.rmSync(path.join(destino, 'node_modules', '.bin'), { recursive: true, force: true }); // enlaces simbólicos: no hacen falta
fs.rmSync(path.join(destino, 'node_modules', '.package-lock.json'), { force: true });

fs.mkdirSync(salida, { recursive: true });
const archivo = path.join(salida, `facturador-${version}.tar.gz`);
execFileSync('tar', ['-czf', archivo, '-C', trabajo, 'facturador'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
const pem = process.env.FACTURADOR_CLAVE_FIRMA || fs.readFileSync(path.join(os.homedir(), '.facturador', 'clave-firma-actualizaciones.pem'), 'utf8');
const firma = crypto.sign(null, fs.readFileSync(archivo), crypto.createPrivateKey(pem));
// Comprueba que la firma cuadra con la clave pública incluida en la aplicación
const publica = crypto.createPublicKey(fs.readFileSync(path.join(raiz, 'server', 'clave-actualizaciones.pem'), 'utf8'));
if (!crypto.verify(null, fs.readFileSync(archivo), publica, firma)) throw new Error('La clave privada no corresponde a server/clave-actualizaciones.pem');
fs.writeFileSync(`${archivo}.sig`, firma.toString('base64'));
fs.rmSync(trabajo, { recursive: true, force: true });
console.log(`Listo: ${path.relative(raiz, archivo)} (${(fs.statSync(archivo).size / 1048576).toFixed(1)} MB) y su firma .sig`);
