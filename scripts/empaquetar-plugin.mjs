// Empaqueta un plugin para publicarlo en GitHub Releases.
// Uso: node scripts/empaquetar-plugin.mjs <carpeta-del-plugin> [url-de-descarga]
// Genera <id>-<version>.tar.gz y muestra la entrada para registry.json (con su SHA-256).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const carpeta = path.resolve(process.argv[2] || '');
const m = JSON.parse(fs.readFileSync(path.join(carpeta, 'plugin.json'), 'utf8'));
const salida = path.resolve(`${m.id}-${m.version}.tar.gz`);
execFileSync('tar', ['-czf', salida, '-C', carpeta, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(salida)).digest('hex');
const url = process.argv[3] || `https://github.com/USUARIO/REPO/releases/download/${m.id}-v${m.version}/${path.basename(salida)}`;
console.log(`Paquete: ${salida}\n\nEntrada para registry.json:`);
console.log(JSON.stringify({ id: m.id, nombre: m.nombre, version: m.version, descripcion: m.descripcion, autor: m.autor, url, sha256 }, null, 2));
