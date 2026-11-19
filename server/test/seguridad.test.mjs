// Pruebas del teléfono verificado, la recuperación de la contraseña por WhatsApp y las passkeys.
// Servidor real con base de datos temporal y un puente de WhatsApp falso que guarda los mensajes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 9196;
const BASE = `http://localhost:${PORT}`;
const enviados = [];
let srv, puente, dir;

const puenteSrv = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => { enviados.push(JSON.parse(b)); res.setHeader('Content-Type', 'application/json'); res.end('{"success":true}'); });
});

function cliente() {
  let cookie = '';
  return async (metodo, ruta, cuerpo) => {
    const r = await fetch(BASE + '/api' + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}
const ultimo = () => enviados.at(-1).message;

before(async () => {
  await new Promise((ok) => puenteSrv.listen(0, '127.0.0.1', ok));
  puente = `http://127.0.0.1:${puenteSrv.address().port}`;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facturador-seg-'));
  srv = spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dir, PLUGINS_DIR: path.join(dir, 'plugins'), WHATSAPP_API: puente, UPDATE_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((ok) => srv.stdout.on('data', (d) => String(d).includes('escuchando') && ok()));
});
after(() => { srv?.kill(); puenteSrv.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('flujo completo de seguridad de cuentas', async (t) => {
  const admin = cliente();
  let r = await admin('POST', '/setup', { usuario: { usuario: 'admin', nombre: 'Admin', password: 'Segura123!x' }, empresa: { razon_social: 'Demo', nif: 'B12345674' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  await t.test('sin teléfono verificado solo se puede verificar', async () => {
    r = await admin('GET', '/estado');
    assert.equal(r.body.usuario.verificar_telefono, true);
    assert.equal(r.body.seguridad.recuperacion, true);
    assert.equal(r.body.seguridad.passkeys, true, 'localhost admite passkeys');
    r = await admin('GET', '/clientes');
    assert.equal(r.status, 403);
    assert.equal(r.body.verificarTelefono, true);
  });

  await t.test('verificación del teléfono', async () => {
    r = await admin('POST', '/cuenta/telefono', { telefono: '600 11 22 33' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(enviados[0].recipient, '34600112233');
    assert.match(enviados[0].message, /^Este es tu código para verificar tu teléfono en Facturador: \d{6}\. ¿No has sido tú\? Ignora este mensaje\.$/);
    r = await admin('POST', '/cuenta/telefono/verificar', { codigo: ultimo() });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await admin('GET', '/clientes');
    assert.equal(r.status, 200);
  });

  await t.test('recuperación de una cuenta bloqueada', async () => {
    r = await admin('POST', '/usuarios', { usuario: 'mayte', nombre: 'Mayte', password: 'Inicial123!', telefono: '611223344' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const anon = cliente();
    for (let i = 0; i < 5; i++) r = await anon('POST', '/login', { usuario: 'mayte', password: 'mal' });
    assert.equal(r.body.bloqueada, true);
    // Sin teléfono verificado no se envía nada (respuesta genérica)
    const n0 = enviados.length;
    r = await anon('POST', '/recuperar/solicitar', { usuario: 'mayte' });
    assert.equal(r.status, 200); assert.equal(enviados.length, n0);
    // El admin la desbloquea; mayte entra, verifica su teléfono y vuelve a bloquearse
    const usuarios = (await admin('GET', '/usuarios')).body;
    const m = usuarios.find((u) => u.usuario === 'mayte');
    assert.equal(m.bloqueado, true);
    assert.equal(m.telefono, '+34611223344');
    r = await admin('PUT', `/usuarios/${m.id}`, { desbloquear: true });
    assert.equal(r.status, 200);
    const mayte = cliente();
    r = await mayte('POST', '/login', { usuario: 'mayte', password: 'Inicial123!' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await new Promise((ok) => setTimeout(ok, 50));
    r = await mayte('POST', '/cuenta/telefono', { telefono: '611223344' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await mayte('POST', '/cuenta/telefono/verificar', { codigo: ultimo() });
    assert.equal(r.status, 200);
    for (let i = 0; i < 5; i++) r = await anon('POST', '/login', { usuario: 'mayte', password: 'mal' });
    assert.equal(r.body.bloqueada, true);

    const n = enviados.length;
    r = await anon('POST', '/recuperar/solicitar', { usuario: 'mayte' });
    assert.equal(r.status, 200);
    assert.equal(enviados.length, n + 2);
    const codigo = enviados[n + 1].message;
    assert.equal(enviados[n].message, `Este es tu código para restablecer la contraseña de Facturador: ${codigo}. ¿No has sido tú? Ignora este mensaje.`);
    r = await anon('POST', '/recuperar/comprobar', { usuario: 'mayte', codigo });
    assert.equal(r.status, 200);
    r = await anon('POST', '/recuperar/confirmar', { usuario: 'mayte', codigo, password: 'Campanilla74@', confirmar: 'Campanilla74@' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await anon('GET', '/estado');
    assert.equal(r.body.usuario.usuario, 'mayte');
    r = await anon('POST', '/recuperar/confirmar', { usuario: 'mayte', codigo, password: 'Otra12345!', confirmar: 'Otra12345!' });
    assert.equal(r.status, 400, 'el código no se puede reutilizar');
    // La sesión anterior de mayte se ha cerrado
    r = await mayte('GET', '/clientes');
    assert.equal(r.status, 401);
  });

  await t.test('usuario inexistente: respuesta genérica sin mensaje', async () => {
    const n = enviados.length;
    r = await cliente()('POST', '/recuperar/solicitar', { usuario: 'nadie' });
    assert.equal(r.status, 200); assert.equal(enviados.length, n);
  });

  await t.test('passkeys y cambio de contraseña', async () => {
    r = await admin('POST', '/passkeys/registro/opciones');
    assert.equal(r.status, 200);
    assert.equal(r.body.rp.id, 'localhost');
    r = await cliente()('POST', '/passkeys/acceso/opciones');
    assert.equal(r.status, 200);
    r = await admin('POST', '/cuenta/clave', { actual: 'Segura123!x', nueva: 'Nueva12345!', confirmar: 'Nueva12345!' });
    assert.equal(r.status, 200);
    r = await admin('GET', '/clientes');
    assert.equal(r.status, 200, 'la sesión actual sigue abierta');
  });

  await t.test('las rutas públicas posteriores no exigen sesión', async () => {
    r = await cliente()('GET', '/apariencia');
    assert.equal(r.status, 200);
  });
});
