// Construye la web pública (GitHub Pages) en dist-web/: web/ + capturas del manual + icono + manual en PDF.
// Sustituye {{VERSION}} por la versión de package.json. El workflow pages.yml la publica.
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve('.');
const salida = path.join(raiz, 'dist-web');
const version = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).version;

fs.rmSync(salida, { recursive: true, force: true });
fs.cpSync(path.join(raiz, 'web'), salida, { recursive: true });
fs.cpSync(path.join(raiz, 'docs', 'manual', 'capturas'), path.join(salida, 'capturas'), { recursive: true });
fs.copyFileSync(path.join(raiz, 'public', 'icon.svg'), path.join(salida, 'icon.svg'));
fs.copyFileSync(path.join(raiz, 'public', 'manual-facturador.pdf'), path.join(salida, 'manual-facturador.pdf'));
fs.writeFileSync(path.join(salida, '.nojekyll'), '');
for (const f of fs.readdirSync(salida).filter((n) => n.endsWith('.html'))) {
  const p = path.join(salida, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('{{VERSION}}', version));
}
console.log(`Web lista en dist-web/ (versión ${version})`);
