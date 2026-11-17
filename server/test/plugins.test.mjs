// Prueba del sistema de plugins: registro, descarga verificada con SHA-256, instalación, API y desinstalación.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 9198;
const BASE = `http://127.0.0.1:${PORT}`;
let srv;
let registro;
let dir;
let cookie = '';
let entradas = [];

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, body: tipo.includes('json') ? await r.json() : await r.text() };
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facturador-plugins-'));
  const paquete = path.join(dir, 'hola.tar.gz');
  execFileSync('tar', ['-czf', paquete, '-C', path.resolve('examples/plugin-hola'), '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const buf = fs.readFileSync(paquete);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

  registro = http.createServer((req, res) => {
    if (req.url === '/registry.json') return res.end(JSON.stringify({ plugins: entradas }));
    if (req.url === '/hola.tar.gz') return res.end(buf);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((ok) => registro.listen(0, '127.0.0.1', ok));
  const rp = registro.address().port;
  entradas = [
    { id: 'hola', nombre: 'Hola mundo', version: '1.0.0', url: `http://127.0.0.1:${rp}/hola.tar.gz`, sha256 },
    { id: 'manipulado', nombre: 'Manipulado', version: '1.0.0', url: `http://127.0.0.1:${rp}/hola.tar.gz`, sha256: 'a'.repeat(64) },
  ];

  srv = spawn(process.execPath, ['server/index.mjs'], {
    env: {
      ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dir, PLUGINS_DIR: path.join(dir, 'plugins'),
      PLUGINS_DEV_HTTP: '1', PLUGINS_REGISTRY: `http://127.0.0.1:${rp}/registry.json`,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((ok) => srv.stdout.on('data', (d) => String(d).includes('escuchando') && ok()));
  await api('POST', '/api/setup', {
    usuario: { usuario: 'admin', nombre: 'Admin', password: 'Contrasena123!' },
    empresa: { razon_social: 'Prueba', nif: '12345678Z' },
  });
});

after(() => {
  srv?.kill();
  registro?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('instala, usa y desinstala un plugin del registro', async () => {
  let r = await api('GET', '/api/plugins/registro');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.plugins.length, 2);

  r = await api('POST', '/api/plugins/manipulado/instalar');
  assert.equal(r.status, 400);
  assert.match(r.body.error, /SHA-256/);

  r = await api('POST', '/api/plugins/hola/instalar');
  assert.equal(r.status, 200, JSON.stringify(r.body));

  r = await api('GET', '/api/plugins/menu');
  assert.deepEqual(r.body.map((p) => p.id), ['hola']);
  assert.equal(r.body[0].entrada, 'ui/index.html');

  r = await api('GET', '/api/p/hola/saludo');
  assert.equal(r.status, 200);
  assert.match(r.body.mensaje, /Hola, Admin/);

  r = await api('GET', '/plugins/hola/ui/index.html');
  assert.equal(r.status, 200);
  assert.match(r.body, /Plugin de ejemplo/);
  r = await api('GET', '/plugins/hola/plugin.json');
  assert.equal(r.status, 200);

  r = await api('POST', '/api/plugins/hola/activo', { activo: false });
  assert.equal((await api('GET', '/api/p/hola/saludo')).status, 404);
  assert.equal((await api('GET', '/plugins/hola/ui/index.html')).status, 404);
  await api('POST', '/api/plugins/hola/activo', { activo: true });
  assert.equal((await api('GET', '/api/p/hola/saludo')).status, 200);

  r = await api('DELETE', '/api/plugins/hola');
  assert.equal(r.status, 200);
  assert.equal((await api('GET', '/api/p/hola/saludo')).status, 404);
  assert.equal(fs.existsSync(path.join(dir, 'plugins', 'hola')), false);
});
