// Correo: cada usuario conecta su cuenta (Google, Microsoft 365 / Outlook / Exchange o SMTP) y envía
// los documentos desde su propio buzón. Plantillas por tipo de documento y registro de todo lo enviado.
import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { db, getAjuste, setAjuste, auditar, DATA_DIR } from '../db.mjs';
import { requiereAdmin } from '../auth.mjs';
import { cifrar, descifrar } from '../lib/cifrado.mjs';
import { cargarDocumento, pdfBuffer } from './documentos.mjs';
import { rutaAdjunto } from './adjuntos.mjs';

export const router = Router();        // requiere sesión
export const routerPublico = Router(); // vuelta de Google/Microsoft (sin cookie de sesión)

// En pruebas, los correos se guardan como .eml en esta carpeta en lugar de enviarse
const DIR_PRUEBA = process.env.CORREO_PRUEBA_DIR || null;

const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const envolver = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
};
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const sinSaltos = (t, max = 300) => String(t ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

/** Lista de direcciones separadas por comas o punto y coma; lanza error si alguna no es válida. */
function direcciones(valor, obligatorio = false) {
  const lista = String(valor || '').split(/[,;]+/).map((d) => d.trim()).filter(Boolean);
  if (obligatorio && !lista.length) throw err('Indica al menos un destinatario');
  if (lista.length > 20) throw err('Demasiados destinatarios (máximo 20)');
  for (const d of lista) if (!EMAIL.test(d)) throw err(`Dirección de correo no válida: ${d}`);
  return lista;
}

// ---------------- Plantillas ----------------
const FIRMA_VARIABLES = '{cliente} {numero} {fecha} {total} {vencimiento} {referencia} {empresa} {usuario} {tipo}';
export const PLANTILLAS_DEFECTO = {
  factura: { asunto: 'Factura {numero} de {empresa}', cuerpo: 'Hola,\n\nTe adjunto la factura {numero} del {fecha} por un total de {total}, con vencimiento el {vencimiento}.\n\nUn saludo,' },
  presupuesto: { asunto: 'Presupuesto {numero} de {empresa}', cuerpo: 'Hola,\n\nTe adjunto el presupuesto {numero} por un total de {total}. Quedamos a tu disposición para cualquier duda.\n\nUn saludo,' },
  proforma: { asunto: 'Factura proforma {numero} de {empresa}', cuerpo: 'Hola,\n\nTe adjunto la factura proforma {numero} por un total de {total}.\n\nUn saludo,' },
  pedido: { asunto: 'Confirmación del pedido {numero}', cuerpo: 'Hola,\n\nTe adjunto la confirmación del pedido {numero}.\n\nUn saludo,' },
  albaran: { asunto: 'Albarán {numero} de {empresa}', cuerpo: 'Hola,\n\nTe adjunto el albarán {numero} del {fecha}.\n\nUn saludo,' },
  pedido_compra: { asunto: 'Pedido {numero} de {empresa}', cuerpo: 'Hola,\n\nOs adjuntamos nuestro pedido {numero}. Por favor, confirmad la recepción y el plazo de entrega.\n\nUn saludo,' },
  presupuesto_compra: { asunto: 'Solicitud de presupuesto {numero}', cuerpo: 'Hola,\n\nOs adjuntamos nuestra solicitud de presupuesto {numero}.\n\nUn saludo,' },
  albaran_compra: { asunto: 'Albarán {numero}', cuerpo: 'Hola,\n\nOs adjuntamos el albarán {numero}.\n\nUn saludo,' },
  factura_compra: { asunto: 'Vuestra factura {numero}', cuerpo: 'Hola,\n\nOs escribimos en relación con vuestra factura {numero}.\n\nUn saludo,' },
  gasto: { asunto: 'Gasto {numero}', cuerpo: 'Hola,\n\nUn saludo,' },
};
export const plantillas = () => {
  const guardadas = getAjuste('plantillas_correo', {});
  return Object.fromEntries(Object.entries(PLANTILLAS_DEFECTO).map(([k, v]) => [k, { ...v, ...(guardadas[k] || {}) }]));
};

const NOMBRE_TIPO = {
  factura: 'factura', presupuesto: 'presupuesto', proforma: 'factura proforma', pedido: 'pedido', albaran: 'albarán',
  pedido_compra: 'pedido', presupuesto_compra: 'solicitud de presupuesto', albaran_compra: 'albarán', factura_compra: 'factura', gasto: 'gasto',
};
const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const fechaEs = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

function rellenar(texto, doc, usuario) {
  const empresa = getAjuste('empresa', {});
  const v = {
    cliente: doc.cliente?.nombre || '', numero: doc.codigo || 'borrador', fecha: fechaEs(doc.fecha), total: eur(doc.total),
    vencimiento: fechaEs(doc.vencimiento) || '—', referencia: doc.referencia || doc.numero_proveedor || '', empresa: empresa.razon_social || '',
    usuario: usuario?.nombre || '', tipo: NOMBRE_TIPO[doc.tipo] || doc.tipo,
  };
  return String(texto || '').replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(v, k) ? v[k] : m));
}

// ---------------- Aplicaciones de Google y Microsoft (OAuth) ----------------
// Las registra el administrador para toda la empresa; un usuario puede usar además la suya propia.
const leerApps = (clave) => {
  const a = getAjuste(clave, {});
  return {
    google: a.google ? { client_id: a.google.client_id, client_secret: descifrar(a.google.secreto) } : null,
    microsoft: a.microsoft ? { client_id: a.microsoft.client_id, client_secret: descifrar(a.microsoft.secreto), tenant: a.microsoft.tenant || 'common' } : null,
  };
};
function appPara(usuarioId, proveedor) {
  const propia = leerApps(`correo_apps_usuario_${usuarioId}`)[proveedor];
  if (propia?.client_id && propia.client_secret) return propia;
  const global = leerApps('correo_apps')[proveedor];
  return global?.client_id && global.client_secret ? global : null;
}
function guardarApps(clave, body) {
  const actual = getAjuste(clave, {});
  const nuevo = { ...actual };
  for (const p of ['google', 'microsoft']) {
    const b = body?.[p];
    if (b === undefined) continue;
    if (b === null || (!b.client_id && !b.client_secret)) { delete nuevo[p]; continue; }
    const id = sinSaltos(b.client_id, 300);
    if (!/^[\w.-]{8,300}$/.test(id)) throw err(`Client ID de ${p === 'google' ? 'Google' : 'Microsoft'} no válido`);
    nuevo[p] = {
      client_id: id,
      // El secreto solo se cambia si se envía uno nuevo (nunca se devuelve al navegador)
      secreto: b.client_secret ? cifrar(sinSaltos(b.client_secret, 500)) : actual[p]?.secreto,
      ...(p === 'microsoft' ? { tenant: /^[\w.-]{1,100}$/.test(b.tenant || '') ? b.tenant : 'common' } : {}),
    };
    if (!nuevo[p].secreto) throw err(`Falta el secreto de ${p === 'google' ? 'Google' : 'Microsoft'}`);
  }
  setAjuste(clave, nuevo);
}
const resumenApps = (clave) => {
  const a = getAjuste(clave, {});
  return {
    google: a.google ? { client_id: a.google.client_id, configurado: !!a.google.secreto } : null,
    microsoft: a.microsoft ? { client_id: a.microsoft.client_id, tenant: a.microsoft.tenant || 'common', configurado: !!a.microsoft.secreto } : null,
  };
};

/** Dirección de vuelta que hay que registrar en Google Cloud y Microsoft Entra. */
function urlRetorno(req) {
  const base = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return `${base}/api/correo/oauth/vuelta`;
}

const OAUTH = {
  google: {
    autorizar: () => 'https://accounts.google.com/o/oauth2/v2/auth',
    token: () => 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile https://www.googleapis.com/auth/gmail.send',
    extra: { access_type: 'offline', prompt: 'consent' },
  },
  microsoft: {
    autorizar: (app) => `https://login.microsoftonline.com/${app.tenant}/oauth2/v2.0/authorize`,
    token: (app) => `https://login.microsoftonline.com/${app.tenant}/oauth2/v2.0/token`,
    scope: 'openid email profile offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read',
    extra: { prompt: 'select_account' },
  },
};

// Estados pendientes de la autorización (10 minutos); identifican al usuario a la vuelta sin depender de la cookie
const pendientes = new Map();
setInterval(() => { for (const [k, v] of pendientes) if (v.expira < Date.now()) pendientes.delete(k); }, 60_000).unref();

async function pedirToken(proveedor, app, campos) {
  const r = await fetch(OAUTH[proveedor].token(app), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: app.client_id, client_secret: app.client_secret, ...campos }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw err(`${proveedor === 'google' ? 'Google' : 'Microsoft'} rechazó la autorización: ${j.error_description || j.error || r.status}`);
  return j;
}

async function emailDeLaCuenta(proveedor, accessToken) {
  const url = proveedor === 'google' ? 'https://openidconnect.googleapis.com/v1/userinfo' : 'https://graph.microsoft.com/v1.0/me';
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw err('No se pudo leer el correo de la cuenta');
  return { email: j.email || j.mail || j.userPrincipalName, nombre: j.name || j.displayName || '' };
}

/** Datos descifrados de la cuenta de un usuario, renovando el token de acceso si ha caducado. */
async function cuentaLista(usuarioId) {
  const c = db.prepare('SELECT * FROM cuentas_correo WHERE usuario_id = ?').get(usuarioId);
  if (!c) throw err('Conecta tu cuenta de correo en Ajustes → Correo antes de enviar', 409);
  const datos = JSON.parse(descifrar(c.datos) || '{}');
  if (c.proveedor !== 'smtp' && (!datos.access_token || datos.expira < Date.now() + 60_000)) {
    const app = appPara(usuarioId, c.proveedor);
    if (!app) throw err('La aplicación de correo ya no está configurada. Avisa al administrador.', 409);
    if (!datos.refresh_token) throw err('La conexión con tu cuenta ha caducado. Vuelve a conectarla en Ajustes → Correo.', 409);
    const t = await pedirToken(c.proveedor, app, { grant_type: 'refresh_token', refresh_token: datos.refresh_token });
    datos.access_token = t.access_token;
    datos.expira = Date.now() + (Number(t.expires_in) || 3600) * 1000;
    if (t.refresh_token) datos.refresh_token = t.refresh_token;
    db.prepare('UPDATE cuentas_correo SET datos = ? WHERE usuario_id = ?').run(cifrar(JSON.stringify(datos)), usuarioId);
  }
  return { ...c, datos };
}

// ---------------- Envío ----------------
async function construirMime(m) {
  return new Promise((ok, ko) => new MailComposer(m).compile().build((e, msg) => (e ? ko(e) : ok(msg))));
}

/** Envía un mensaje con la cuenta del usuario. Devuelve el id del mensaje (si el proveedor lo da). */
async function enviar(cuenta, m) {
  const desde = cuenta.nombre ? `"${cuenta.nombre.replace(/"/g, '')}" <${cuenta.email}>` : cuenta.email;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5">${
    m.texto.split('\n').map((l) => l.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]) || '&nbsp;').join('<br>')}</div>`;
  const mensaje = { from: desde, to: m.para, cc: m.cc, bcc: m.cco, subject: m.asunto, text: m.texto, html, attachments: m.adjuntos };

  if (DIR_PRUEBA) {
    fs.mkdirSync(DIR_PRUEBA, { recursive: true });
    const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(path.join(DIR_PRUEBA, `${id}.eml`), await construirMime(mensaje));
    return id;
  }
  if (cuenta.proveedor === 'smtp') {
    const d = cuenta.datos;
    const t = nodemailer.createTransport({ host: d.host, port: d.puerto, secure: !!d.seguro, auth: { user: d.usuario, pass: d.password }, connectionTimeout: 15_000 });
    const info = await t.sendMail(mensaje);
    return info.messageId;
  }
  if (cuenta.proveedor === 'google') {
    const raw = (await construirMime(mensaje)).toString('base64url');
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { Authorization: `Bearer ${cuenta.datos.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }), signal: AbortSignal.timeout(30_000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw err(`Gmail no pudo enviar el correo: ${j.error?.message || r.status}`, 502);
    return j.id;
  }
  // Microsoft Graph
  const lista = (v) => (v || []).map((address) => ({ emailAddress: { address } }));
  const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST', headers: { Authorization: `Bearer ${cuenta.datos.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: m.asunto, body: { contentType: 'HTML', content: html },
        toRecipients: lista(m.para), ccRecipients: lista(m.cc), bccRecipients: lista(m.cco),
        attachments: (m.adjuntos || []).map((a) => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.filename, contentType: a.contentType, contentBytes: a.content.toString('base64') })),
      },
      saveToSentItems: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw err(`Outlook no pudo enviar el correo: ${j.error?.message || r.status}`, 502);
  }
  return null;
}

// Límite por usuario para evitar envíos masivos por error
const envios = new Map();
function limitarEnvios(usuarioId) {
  const ahora = Date.now();
  const lista = (envios.get(usuarioId) || []).filter((t) => ahora - t < 10 * 60_000);
  if (lista.length >= 30) throw err('Has enviado muchos correos en poco tiempo. Espera unos minutos.', 429);
  lista.push(ahora);
  envios.set(usuarioId, lista);
}

// ---------------- Rutas: cuenta del usuario ----------------
router.get('/estado', envolver((req, res) => {
  const c = db.prepare('SELECT proveedor, email, nombre, firma, conectado FROM cuentas_correo WHERE usuario_id = ?').get(req.usuario.id);
  res.json({
    cuenta: c || null,
    disponibles: { google: !!appPara(req.usuario.id, 'google'), microsoft: !!appPara(req.usuario.id, 'microsoft'), smtp: true },
    url_retorno: urlRetorno(req),
    mis_apps: resumenApps(`correo_apps_usuario_${req.usuario.id}`),
  });
}));

router.get('/oauth/:proveedor/iniciar', envolver((req, res) => {
  const proveedor = req.params.proveedor;
  if (!OAUTH[proveedor]) throw err('Proveedor no válido', 404);
  const app = appPara(req.usuario.id, proveedor);
  if (!app) throw err(`Falta configurar la aplicación de ${proveedor === 'google' ? 'Google' : 'Microsoft'} (Ajustes → Correo)`, 409);
  const estado = crypto.randomBytes(24).toString('base64url');
  const verificador = crypto.randomBytes(32).toString('base64url');
  const retorno = urlRetorno(req);
  pendientes.set(estado, { usuarioId: req.usuario.id, usuario: req.usuario.usuario, proveedor, verificador, retorno, expira: Date.now() + 10 * 60_000 });
  const url = new URL(OAUTH[proveedor].autorizar(app));
  url.search = new URLSearchParams({
    client_id: app.client_id, response_type: 'code', redirect_uri: retorno, scope: OAUTH[proveedor].scope, state: estado,
    code_challenge: crypto.createHash('sha256').update(verificador).digest('base64url'), code_challenge_method: 'S256',
    ...OAUTH[proveedor].extra,
  }).toString();
  res.json({ url: url.toString() });
}));

// Página intermedia: redirige dentro de la propia aplicación (navegación del mismo sitio, la cookie de sesión vuelve a enviarse)
function volverAAjustes(res, resultado, mensaje = '') {
  const destino = `/ajustes?pestana=correo&correo=${resultado}${mensaje ? `&mensaje=${encodeURIComponent(mensaje)}` : ''}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${destino.replace(/"/g, '&quot;')}">
<title>Facturador</title><p style="font-family:sans-serif">Volviendo a Facturador… <a href="${destino.replace(/"/g, '&quot;')}">Continuar</a></p>`);
}

routerPublico.get('/oauth/vuelta', envolver(async (req, res) => {
  const p = pendientes.get(String(req.query.state || ''));
  pendientes.delete(String(req.query.state || ''));
  if (!p || p.expira < Date.now()) return volverAAjustes(res, 'error', 'La autorización ha caducado. Inténtalo de nuevo.');
  if (req.query.error) return volverAAjustes(res, 'error', String(req.query.error_description || req.query.error).slice(0, 200));
  try {
    const app = appPara(p.usuarioId, p.proveedor);
    const t = await pedirToken(p.proveedor, app, { grant_type: 'authorization_code', code: String(req.query.code || ''), redirect_uri: p.retorno, code_verifier: p.verificador });
    const { email, nombre } = await emailDeLaCuenta(p.proveedor, t.access_token);
    if (!email) throw err('La cuenta no tiene dirección de correo');
    const datos = cifrar(JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token, expira: Date.now() + (Number(t.expires_in) || 3600) * 1000 }));
    db.prepare(`INSERT INTO cuentas_correo(usuario_id, proveedor, email, nombre, datos) VALUES (?,?,?,?,?)
      ON CONFLICT(usuario_id) DO UPDATE SET proveedor=excluded.proveedor, email=excluded.email, nombre=excluded.nombre, datos=excluded.datos, conectado=datetime('now')`)
      .run(p.usuarioId, p.proveedor, email, nombre, datos);
    auditar({ usuario: { usuario: p.usuario }, ip: req.ip }, 'correo.conectar', `${p.proveedor} ${email}`, 'aviso');
    volverAAjustes(res, 'ok');
  } catch (e) {
    volverAAjustes(res, 'error', e.message);
  }
}));

router.post('/smtp', envolver(async (req, res) => {
  const b = req.body;
  const d = {
    host: sinSaltos(b.host, 200), puerto: Number(b.puerto) || 587, seguro: !!b.seguro,
    usuario: sinSaltos(b.usuario, 200), password: String(b.password || ''),
  };
  const email = sinSaltos(b.email, 200);
  if (!EMAIL.test(email)) throw err('Correo del remitente no válido');
  if (!/^[\w.-]+$/.test(d.host)) throw err('Servidor SMTP no válido');
  if (d.puerto < 1 || d.puerto > 65535) throw err('Puerto no válido');
  const anterior = db.prepare("SELECT datos FROM cuentas_correo WHERE usuario_id = ? AND proveedor = 'smtp'").get(req.usuario.id);
  if (!d.password && anterior) d.password = JSON.parse(descifrar(anterior.datos) || '{}').password || '';
  if (!DIR_PRUEBA) {
    // Comprueba la conexión antes de guardar
    try {
      await nodemailer.createTransport({ host: d.host, port: d.puerto, secure: d.seguro, auth: { user: d.usuario, pass: d.password }, connectionTimeout: 15_000 }).verify();
    } catch (e) {
      throw err(`No se pudo conectar con el servidor SMTP: ${e.message}`);
    }
  }
  db.prepare(`INSERT INTO cuentas_correo(usuario_id, proveedor, email, nombre, datos) VALUES (?, 'smtp', ?, ?, ?)
    ON CONFLICT(usuario_id) DO UPDATE SET proveedor='smtp', email=excluded.email, nombre=excluded.nombre, datos=excluded.datos, conectado=datetime('now')`)
    .run(req.usuario.id, email, sinSaltos(b.nombre, 120), cifrar(JSON.stringify(d)));
  auditar(req, 'correo.conectar', `smtp ${email}`, 'aviso');
  res.json({ ok: true });
}));

router.put('/cuenta', envolver((req, res) => {
  const r = db.prepare('UPDATE cuentas_correo SET nombre = ?, firma = ? WHERE usuario_id = ?')
    .run(sinSaltos(req.body.nombre, 120), String(req.body.firma || '').slice(0, 2000), req.usuario.id);
  if (!r.changes) throw err('No tienes ninguna cuenta conectada', 404);
  res.json({ ok: true });
}));

router.delete('/cuenta', envolver((req, res) => {
  db.prepare('DELETE FROM cuentas_correo WHERE usuario_id = ?').run(req.usuario.id);
  auditar(req, 'correo.desconectar', '', 'aviso');
  res.json({ ok: true });
}));

router.post('/prueba', envolver(async (req, res) => {
  limitarEnvios(req.usuario.id);
  const cuenta = await cuentaLista(req.usuario.id);
  await enviar(cuenta, { para: [cuenta.email], asunto: 'Prueba de correo de Facturador', texto: `Si lees esto, tu cuenta ${cuenta.email} está bien conectada a Facturador.` });
  res.json({ ok: true, enviado_a: cuenta.email });
}));

// Aplicaciones propias del usuario (opcional, si no usa las de la empresa)
router.put('/mis-apps', envolver((req, res) => {
  guardarApps(`correo_apps_usuario_${req.usuario.id}`, req.body);
  res.json(resumenApps(`correo_apps_usuario_${req.usuario.id}`));
}));

// ---------------- Rutas: administración ----------------
router.get('/apps', requiereAdmin, envolver((req, res) => res.json({ ...resumenApps('correo_apps'), url_retorno: urlRetorno(req) })));
router.put('/apps', requiereAdmin, envolver((req, res) => {
  guardarApps('correo_apps', req.body);
  auditar(req, 'correo.apps', '', 'aviso');
  res.json(resumenApps('correo_apps'));
}));

router.get('/plantillas', envolver((_req, res) => res.json({ plantillas: plantillas(), variables: FIRMA_VARIABLES })));
router.put('/plantillas', requiereAdmin, envolver((req, res) => {
  const nuevas = {};
  for (const [tipo, p] of Object.entries(req.body?.plantillas || {})) {
    if (!PLANTILLAS_DEFECTO[tipo]) continue;
    nuevas[tipo] = { asunto: sinSaltos(p.asunto, 200) || PLANTILLAS_DEFECTO[tipo].asunto, cuerpo: String(p.cuerpo || '').slice(0, 5000) || PLANTILLAS_DEFECTO[tipo].cuerpo };
  }
  setAjuste('plantillas_correo', nuevas);
  auditar(req, 'correo.plantillas');
  res.json({ plantillas: plantillas() });
}));

// ---------------- Rutas: enviar un documento ----------------
/** Adjuntos que se pueden elegir para un documento. */
function adjuntosDisponibles(doc) {
  const lista = [{ id: 'pdf', nombre: `${(doc.codigo || `borrador-${doc.id}`).replace(/[^\w.-]+/g, '-')}.pdf`, tipo: 'pdf', marcado: true }];
  if (doc.tipo === 'albaran') lista.push({ id: 'pdf_sin_valorar', nombre: `${(doc.codigo || doc.id).toString().replace(/[^\w.-]+/g, '-')}-sin-valorar.pdf`, tipo: 'pdf', marcado: false });
  for (const a of db.prepare("SELECT id, nombre, mime, tamano FROM adjuntos WHERE entidad = 'documento' AND entidad_id = ? ORDER BY id").all(doc.id)) {
    lista.push({ id: `adj:${a.id}`, nombre: a.nombre, tipo: a.mime, tamano: a.tamano, marcado: false });
  }
  return lista;
}

router.get('/documentos/:id/borrador', envolver((req, res) => {
  const doc = cargarDocumento(Number(req.params.id));
  if (!doc) throw err('No encontrado', 404);
  const p = plantillas()[doc.tipo] || PLANTILLAS_DEFECTO.factura;
  const cuenta = db.prepare('SELECT proveedor, email, nombre, firma FROM cuentas_correo WHERE usuario_id = ?').get(req.usuario.id);
  // Destinatario: el email del cliente o proveedor del documento (el actual de su ficha, o el guardado al emitir)
  const tabla = doc.proveedor_id ? 'proveedores' : 'clientes';
  const terceroId = doc.proveedor_id || doc.cliente_id;
  const email = (terceroId && db.prepare(`SELECT email FROM ${tabla} WHERE id = ?`).get(terceroId)?.email) || doc.cliente?.email || '';
  // Firma del usuario o, si no tiene, su nombre y el de la empresa
  const empresa = getAjuste('empresa', {}).razon_social || '';
  const firma = cuenta?.firma || [req.usuario.nombre, empresa].filter(Boolean).join('\n');
  const cuerpo = rellenar(p.cuerpo, doc, req.usuario) + (firma ? `\n${firma}` : '');
  res.json({ cuenta: cuenta || null, para: email, cc: '', cco: '', asunto: rellenar(p.asunto, doc, req.usuario), cuerpo, adjuntos: adjuntosDisponibles(doc) });
}));

router.post('/documentos/:id/enviar', envolver(async (req, res) => {
  const doc = cargarDocumento(Number(req.params.id));
  if (!doc) throw err('No encontrado', 404);
  if (doc.estado === 'borrador') throw err('Emite el documento antes de enviarlo', 409);
  const para = direcciones(req.body.para, true);
  const cc = direcciones(req.body.cc);
  const cco = direcciones(req.body.cco);
  const asunto = sinSaltos(req.body.asunto, 250);
  const texto = String(req.body.cuerpo || '').slice(0, 20000);
  if (!asunto) throw err('El asunto no puede estar vacío');
  limitarEnvios(req.usuario.id);
  const cuenta = await cuentaLista(req.usuario.id);

  // Adjuntos: solo los de este documento
  const elegidos = new Set(Array.isArray(req.body.adjuntos) ? req.body.adjuntos.map(String) : ['pdf']);
  const disponibles = adjuntosDisponibles(doc);
  const adjuntos = [];
  let total = 0;
  for (const a of disponibles.filter((x) => elegidos.has(x.id))) {
    let contenido;
    let tipo = a.tipo;
    if (a.id === 'pdf' || a.id === 'pdf_sin_valorar') {
      contenido = await pdfBuffer(doc.id, { sinValorar: a.id === 'pdf_sin_valorar', valorar: a.id === 'pdf' && doc.tipo === 'albaran' && doc.valorado });
      tipo = 'application/pdf';
    } else {
      const ruta = rutaAdjunto(Number(a.id.slice(4)));
      if (!ruta) continue;
      contenido = fs.readFileSync(ruta);
    }
    total += contenido.length;
    adjuntos.push({ filename: a.nombre, content: contenido, contentType: tipo });
  }
  if (total > 20 * 1024 * 1024) throw err('Los adjuntos superan 20 MB');

  const registro = db.prepare(`INSERT INTO correos_enviados(documento_id, usuario_id, desde, proveedor, para, cc, cco, asunto, cuerpo, adjuntos, estado, error, id_mensaje)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const nombresAdj = JSON.stringify(adjuntos.map((a) => a.filename));
  try {
    const idMensaje = await enviar(cuenta, { para, cc, cco, asunto, texto, adjuntos });
    registro.run(doc.id, req.usuario.id, cuenta.email, cuenta.proveedor, para.join(', '), cc.join(', '), cco.join(', '), asunto, texto, nombresAdj, 'enviado', null, idMensaje);
    auditar(req, 'correo.enviar', `${doc.codigo} → ${para.join(', ')}`);
    res.json({ ok: true });
  } catch (e) {
    registro.run(doc.id, req.usuario.id, cuenta.email, cuenta.proveedor, para.join(', '), cc.join(', '), cco.join(', '), asunto, texto, nombresAdj, 'error', String(e.message).slice(0, 500), null);
    throw e.status ? e : err(`No se pudo enviar: ${e.message}`, 502);
  }
}));

router.get('/documentos/:id/enviados', envolver((req, res) => {
  res.json(db.prepare(`SELECT c.id, c.desde, c.proveedor, c.para, c.cc, c.cco, c.asunto, c.cuerpo, c.adjuntos, c.estado, c.error, c.fecha, u.nombre AS usuario
    FROM correos_enviados c LEFT JOIN usuarios u ON u.id = c.usuario_id WHERE c.documento_id = ? ORDER BY c.id DESC`).all(Number(req.params.id))
    .map((c) => ({ ...c, adjuntos: JSON.parse(c.adjuntos || '[]') })));
}));
