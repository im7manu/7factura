// Prueba de extremo a extremo de las actualizaciones: supervisor real, «GitHub» falso, paquetes firmados,
// actualización correcta, firma manipulada y versión rota con vuelta atrás automática sin pérdida de datos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RAIZ = path.resolve('.');
const PUERTO = 9191;
const BASE = `http://127.0.0.1:${PUERTO}`;

/** Crea el paquete de una versión a partir del código actual (sin node_modules: se reutilizan los de producción). */
function crearPaquete(dir, version, { romper = false, colgar = false } = {}) {
  const trabajo = fs.mkdtempSync(path.join(dir, 'pkg-'));
  const app = path.join(trabajo, 'facturador');
  fs.mkdirSync(app);
  for (const f of ['server', 'shared', 'scripts', 'dist']) fs.cpSync(path.join(RAIZ, f), path.join(app, f), { recursive: true, filter: (s) => !s.includes(`${path.sep}test`) });
  const pk = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ ...pk, version }, null, 2));
  if (romper) {
    // Versión rota: estropea datos y no llega a arrancar
    const idx = path.join(app, 'server', 'index.mjs');
    fs.writeFileSync(idx, `import { db } from './db.mjs';\ndb.exec('DELETE FROM clientes');\nthrow new Error('versión rota a propósito');\n${fs.readFileSync(idx, 'utf8')}`);
  }
  if (colgar) {
    // Versión colgada: estropea datos, nunca responde y termina sola al cabo de un rato
    fs.writeFileSync(path.join(app, 'server', 'index.mjs'), `import { db } from './db.mjs';\ndb.exec('DELETE FROM clientes');\nsetTimeout(() => process.exit(1), 15000);\n`);
  }
  const archivo = path.join(dir, `facturador-${version}.tar.gz`);
  execFileSync('tar', ['-czf', archivo, '-C', trabajo, 'facturador'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  return archivo;
}

test('actualizaciones: firma, instalación, vuelta atrás y datos intactos', { timeout: 120_000 }, async () => {
  if (!fs.existsSync(path.join(RAIZ, 'dist', 'index.html'))) execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-act-'));
  const datos = path.join(dir, 'datos');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const firmar = (f) => crypto.sign(null, fs.readFileSync(f), privateKey).toString('base64');

  // «GitHub» falso: sirve la última Release y sus archivos
  let release = null;
  const gh = http.createServer((req, res) => {
    if (req.url === '/repos/prueba/facturador/releases/latest') {
      if (!release) { res.statusCode = 404; return res.end('{}'); }
      return res.end(JSON.stringify(release.json));
    }
    const a = release?.archivos[req.url];
    if (a) return res.end(a);
    res.statusCode = 404; res.end();
  });
  await new Promise((ok) => gh.listen(0, '127.0.0.1', ok));
  const ghBase = `http://127.0.0.1:${gh.address().port}`;
  const publicar = (version, paquete, firma) => {
    release = {
      json: { tag_name: `v${version}`, draft: false, prerelease: false, body: `Novedades de la ${version}`, published_at: new Date().toISOString(),
        assets: [{ name: `facturador-${version}.tar.gz`, browser_download_url: `${ghBase}/p/${version}.tgz`, size: 1 },
          { name: `facturador-${version}.tar.gz.sig`, browser_download_url: `${ghBase}/p/${version}.sig`, size: 1 }] },
      archivos: { [`/p/${version}.tgz`]: fs.readFileSync(paquete), [`/p/${version}.sig`]: firma },
    };
  };

  let log = '';
  const arrancarSupervisor = () => {
    const s = spawn(process.execPath, ['scripts/supervisor.mjs'], {
      cwd: RAIZ,
      env: { ...process.env, PORT: String(PUERTO), HOST: '127.0.0.1', DATA_DIR: datos, UPDATE_API: ghBase, UPDATE_REPO: 'prueba/facturador',
        UPDATE_PUBKEY: publicKey.export({ type: 'spki', format: 'pem' }), UPDATE_HEALTH_SECONDS: '4' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    s.stdout.on('data', (d) => { log += d; });
    s.stderr.on('data', (d) => { log += d; });
    return s;
  };
  let sup = arrancarSupervisor();
  let cookie = '';
  const api = async (m, r, b) => {
    const x = await fetch(BASE + r, { method: m, headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE }, body: b ? JSON.stringify(b) : undefined });
    const sc = x.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: x.status, body: await x.json().catch(() => null) };
  };
  const esperarResultado = async (estado, ms = 30_000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      try { const r = await api('GET', '/api/actualizaciones'); if (r.body?.resultado?.estado === estado) return r; } catch { /* reiniciando */ }
      await new Promise((ok) => setTimeout(ok, 500));
    }
    throw new Error(`No llegó el resultado «${estado}»:\n${log.slice(-3000)}`);
  };
  const esperarVersion = async (v, ms = 40_000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      try { const r = await api('GET', '/api/estado'); if (r.body?.version === v) return true; } catch { /* reiniciando */ }
      await new Promise((ok) => setTimeout(ok, 500));
    }
    throw new Error(`No arrancó la versión ${v}:\n${log.slice(-3000)}`);
  };

  try {
    const actual = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version;
    await new Promise((ok) => { const t = setInterval(() => { if (log.includes('escuchando')) { clearInterval(t); ok(); } }, 200); });
    await api('POST', '/api/setup', { usuario: { usuario: 'admin', nombre: 'Admin', password: 'Contrasena123!' }, empresa: { razon_social: 'Prueba', nif: '12345678Z' } });
    await api('POST', '/api/clientes', { nombre: 'Cliente que no se puede perder', nif: 'B12345674' });
    await esperarVersion(actual);

    // Sin versiones publicadas
    let r = await api('POST', '/api/actualizaciones/comprobar');
    assert.equal(r.body.disponible, null);

    // Una versión con la firma manipulada se rechaza
    const p2 = crearPaquete(dir, '99.0.0');
    publicar('99.0.0', p2, crypto.sign(null, Buffer.from('otra cosa'), privateKey).toString('base64'));
    r = await api('POST', '/api/actualizaciones/comprobar');
    assert.equal(r.body.disponible.version, '99.0.0');
    r = await api('POST', '/api/actualizaciones/instalar');
    assert.equal(r.status, 409);
    assert.match(r.body.error, /firma/i);

    // Versión correcta: se instala, el supervisor la arranca y los datos siguen ahí
    publicar('99.0.0', p2, firmar(p2));
    r = await api('POST', '/api/actualizaciones/instalar');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await esperarVersion('99.0.0');
    assert.deepEqual((await api('GET', '/api/clientes')).body.map((c) => c.nombre), ['Cliente que no se puede perder']);
    r = await esperarResultado('ok');
    assert.equal(r.body.supervisado, true);
    assert.ok(fs.readdirSync(path.join(datos, 'actualizaciones', 'copias')).length >= 1, 'hay copia previa');

    // Versión rota: borra clientes y no arranca → vuelta atrás automática con la base de datos restaurada
    const p3 = crearPaquete(dir, '99.1.0', { romper: true });
    publicar('99.1.0', p3, firmar(p3));
    await api('POST', '/api/actualizaciones/comprobar');
    r = await api('POST', '/api/actualizaciones/instalar');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await new Promise((ok) => setTimeout(ok, 6000));
    await esperarVersion('99.0.0', 60_000);
    assert.match(log, /no ha superado el periodo de prueba/);
    assert.deepEqual((await api('GET', '/api/clientes')).body.map((c) => c.nombre), ['Cliente que no se puede perder']);
    r = await esperarResultado('revertida');
    assert.match(r.body.resultado.mensaje, /No se ha perdido ningún dato/);
    assert.equal(r.body.historial[0].evento, 'revertida');

    // Periodo de prueba cortado de golpe (apagado, ventana de Windows cerrada): al volver se repite y, como la versión
    // es mala, se vuelve atrás con la base de datos restaurada
    const p4 = crearPaquete(dir, '99.2.0', { colgar: true });
    publicar('99.2.0', p4, firmar(p4));
    await api('POST', '/api/actualizaciones/comprobar');
    r = await api('POST', '/api/actualizaciones/instalar');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const enPrueba = path.join(datos, 'actualizaciones', 'en-prueba.json');
    for (let i = 0; i < 100 && !fs.existsSync(enPrueba); i++) await new Promise((ok) => setTimeout(ok, 100));
    assert.ok(fs.existsSync(enPrueba), 'el supervisor marca el periodo de prueba');
    await new Promise((ok) => setTimeout(ok, 1500)); // la versión colgada ya ha borrado los clientes
    sup.kill('SIGKILL');
    await new Promise((ok) => sup.once('exit', ok));
    log = '';
    sup = arrancarSupervisor();
    await new Promise((ok) => setTimeout(ok, 6000));
    await esperarVersion('99.0.0', 60_000);
    assert.match(log, /periodo de prueba de la versión 99\.2\.0 se interrumpió/);
    assert.deepEqual((await api('GET', '/api/clientes')).body.map((c) => c.nombre), ['Cliente que no se puede perder']);
    assert.ok(!fs.existsSync(enPrueba));

    // Una versión anterior a la instalada no se ofrece
    publicar('1.0.0', p2, firmar(p2));
    assert.equal((await api('POST', '/api/actualizaciones/comprobar')).body.disponible, null);
  } finally {
    sup.kill('SIGTERM');
    await new Promise((ok) => sup.once('exit', ok));
    gh.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
