// Seguridad de las cuentas: teléfono verificado por WhatsApp, recuperación de la contraseña con un código
// enviado por WhatsApp y acceso con passkeys (WebAuthn). Mismo comportamiento que Gestor DeCA y eCMR.
//
// WhatsApp: los mensajes se envían por un puente HTTP compatible con whatsapp-mcp
// (POST <url>/api/send con { recipient, message }). La dirección se toma de WHATSAPP_API o, si no existe,
// del ajuste «whatsapp.url» que el administrador configura en Ajustes › Seguridad. Sin ella, la verificación
// del teléfono no se exige y la recuperación por WhatsApp no está disponible.
//
// Passkeys: el dominio (RP ID) es el de la dirección con la que se abre la aplicación (o RP_ID). WebAuthn no
// admite direcciones IP, así que en la versión de escritorio (127.0.0.1) las passkeys no están disponibles.
import crypto from 'node:crypto';
import { Router } from 'express';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { db, getAjuste, setAjuste, auditar } from './db.mjs';
import { hashPassword, verifyPassword, errorPassword, crearSesion, requiereSesion, requiereAdmin } from './auth.mjs';

const NOMBRE_APP = 'Facturador';
const CODIGO_MIN = 10;
const CODIGO_INTENTOS = 5;

export function normalizarTelefono(t) {
  let s = String(t || '').trim().replace(/[\s().-]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  else if (/^[6789]\d{8}$/.test(s)) s = '34' + s;
  return /^[1-9]\d{7,14}$/.test(s) ? s : '';
}
export const ocultarTelefono = (t) => (t ? `+${String(t).slice(0, 2)} ··· ··· ${String(t).slice(-3)}` : '');

function nombreDispositivo(ua = '') {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Dispositivo';
}

// ---------------- Configuración ----------------
const urlWhatsApp = () => (process.env.WHATSAPP_API || getAjuste('whatsapp', {})?.url || '').replace(/\/$/, '');
export const whatsappActivo = () => !!urlWhatsApp();
const exigirTelefono = () => whatsappActivo() && process.env.WHATSAPP_EXIGIR !== '0' && getAjuste('whatsapp', {})?.exigir !== false;
export const debeVerificar = (u) => !!u && exigirTelefono() && !u.telefono_verificado;

const esIp = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');
function rp(req) {
  const id = process.env.RP_ID || req.hostname;
  const origen = process.env.RP_ORIGIN || `${req.protocol}://${req.get('host')}`;
  return { id, origen, disponible: !!id && !esIp(id) && (origen.startsWith('https://') || id === 'localhost') };
}
export const passkeysDisponibles = (req) => rp(req).disponible;

// ---------------- WhatsApp ----------------
async function enviarWhatsApp(telefono, mensaje, url = urlWhatsApp()) {
  if (!url) throw new Error('El envío por WhatsApp no está configurado.');
  const r = await fetch(`${url}/api/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: telefono, message: mensaje }), signal: AbortSignal.timeout(15_000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new Error(`WhatsApp no aceptó el mensaje${d.message ? ': ' + d.message : ''}`);
}
// El código va también en un mensaje aparte para copiarlo con una pulsación larga
async function enviarCodigo(telefono, texto, codigo) {
  await enviarWhatsApp(telefono, texto);
  await enviarWhatsApp(telefono, codigo);
}

// ---------------- Límites ----------------
const porIp = new Map();
function limiteIp(clave, max = 10, ventana = 3_600_000) {
  const ahora = Date.now();
  const lista = (porIp.get(clave) || []).filter((t) => ahora - t < ventana);
  if (lista.length >= max) return false;
  lista.push(ahora); porIp.set(clave, lista);
  return true;
}
setInterval(() => { const a = Date.now(); for (const [k, v] of porIp) if (!v.some((t) => a - t < 3_600_000)) porIp.delete(k); }, 1_800_000).unref();

function limiteUsuario(uid, tipo) {
  const ahora = Date.now();
  const ult = db.prepare('SELECT creado FROM codigos WHERE usuario_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1').get(uid, tipo);
  if (ult && ahora - ult.creado < 60_000) return `Espera ${Math.ceil((60_000 - (ahora - ult.creado)) / 1000)} s antes de pedir otro código.`;
  const n = db.prepare('SELECT COUNT(*) c FROM codigos WHERE usuario_id = ? AND tipo = ? AND creado > ?').get(uid, tipo, ahora - 3_600_000).c;
  return n >= 5 ? 'Has pedido demasiados códigos. Inténtalo dentro de una hora.' : null;
}

// ---------------- Códigos ----------------
const hashCodigo = (codigo, sal) => crypto.createHash('sha256').update(`${sal}:${codigo}`).digest('hex');
function crearCodigo(uid, tipo, destino) {
  const codigo = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  const sal = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE codigos SET usado = 1 WHERE usuario_id = ? AND tipo = ? AND usado = 0').run(uid, tipo);
  db.prepare('INSERT INTO codigos(usuario_id, tipo, destino, sal, hash, expira, creado) VALUES (?,?,?,?,?,?,?)')
    .run(uid, tipo, destino, sal, hashCodigo(codigo, sal), Date.now() + CODIGO_MIN * 60_000, Date.now());
  db.prepare('DELETE FROM codigos WHERE creado < ?').run(Date.now() - 7 * 864e5);
  return codigo;
}
function comprobarCodigo(uid, tipo, codigo, consumir) {
  const c = db.prepare('SELECT * FROM codigos WHERE usuario_id = ? AND tipo = ? AND usado = 0 ORDER BY id DESC LIMIT 1').get(uid, tipo);
  if (!c || c.expira < Date.now()) return { error: 'El código ha caducado o no existe. Pide uno nuevo.' };
  if (c.intentos >= CODIGO_INTENTOS) return { error: 'Has superado los intentos permitidos para este código. Pide uno nuevo.' };
  const limpio = String(codigo || '').replace(/\D/g, '');
  const ok = limpio.length === 6 && crypto.timingSafeEqual(Buffer.from(hashCodigo(limpio, c.sal), 'hex'), Buffer.from(c.hash, 'hex'));
  if (!ok) {
    db.prepare('UPDATE codigos SET intentos = intentos + 1 WHERE id = ?').run(c.id);
    const quedan = CODIGO_INTENTOS - c.intentos - 1;
    return { error: quedan > 0 ? `Código incorrecto. Te quedan ${quedan} intento${quedan === 1 ? '' : 's'}.` : 'Código incorrecto. Pide uno nuevo.' };
  }
  if (consumir) db.prepare('UPDATE codigos SET usado = 1 WHERE id = ?').run(c.id);
  return { ok: true, destino: c.destino };
}

const usuarioPorNombre = (n) => db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(String(n || '').trim().slice(0, 50));
const quien = (u, req) => ({ usuario: { usuario: u?.usuario ?? String(req.body?.usuario || '').slice(0, 50) }, ip: req.ip });

// ---------------- Passkeys ----------------
const desafios = new Map();
const guardarDesafio = (id, d) => {
  const a = Date.now();
  for (const [k, v] of desafios) if (v.expira < a) desafios.delete(k);
  desafios.set(id, { ...d, expira: a + 5 * 60_000 });
};
const tomarDesafio = (id) => { const d = desafios.get(id); desafios.delete(id); return d && d.expira > Date.now() ? d : null; };
const passkeysDe = (uid) => db.prepare('SELECT * FROM passkeys WHERE usuario_id = ? ORDER BY creada').all(uid);
const publica = (p) => ({ id: p.id, nombre: p.nombre, creada: p.creada, ultimo_uso: p.ultimo_uso, sincronizada: !!p.sincronizada });
export const numPasskeys = (uid) => db.prepare('SELECT COUNT(*) c FROM passkeys WHERE usuario_id = ?').get(uid).c;

// ================= Rutas públicas =================
export const seguridadPublica = Router();

seguridadPublica.post('/recuperar/solicitar', async (req, res) => {
  if (!whatsappActivo()) return res.status(503).json({ error: 'La recuperación por WhatsApp no está disponible. Pide al administrador que te cambie la contraseña.' });
  if (!limiteIp('rec:' + req.ip, 10)) return res.status(429).json({ error: 'Demasiadas solicitudes desde esta conexión. Inténtalo más tarde.' });
  const nombre = String(req.body?.usuario || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Indica tu usuario.' });
  const generico = { ok: true, mensaje: 'Si el usuario existe y tiene un teléfono verificado, recibirás un código por WhatsApp en unos segundos.' };
  const u = usuarioPorNombre(nombre);
  if (!u || !u.activo || !u.telefono || !u.telefono_verificado) {
    auditar(quien(u, req), 'recuperacion.sin_telefono', u ? 'Sin teléfono verificado o cuenta desactivada' : 'Usuario inexistente', 'aviso');
    return res.json(generico);
  }
  const lim = limiteUsuario(u.id, 'recuperar');
  if (lim) return res.status(429).json({ error: lim });
  const codigo = crearCodigo(u.id, 'recuperar', u.telefono);
  try {
    await enviarCodigo(u.telefono, `Este es tu código para restablecer la contraseña de ${NOMBRE_APP}: ${codigo}. ¿No has sido tú? Ignora este mensaje.`, codigo);
    auditar(quien(u, req), 'recuperacion.codigo_enviado', ocultarTelefono(u.telefono), 'aviso');
  } catch (e) {
    db.prepare("UPDATE codigos SET usado = 1 WHERE usuario_id = ? AND tipo = 'recuperar'").run(u.id);
    auditar(quien(u, req), 'recuperacion.error_envio', e.message, 'alerta');
    return res.status(502).json({ error: 'No se pudo enviar el WhatsApp ahora mismo. Inténtalo en unos minutos o avisa al administrador.' });
  }
  res.json(generico);
});

seguridadPublica.post('/recuperar/comprobar', (req, res) => {
  const u = usuarioPorNombre(req.body?.usuario);
  if (!u || !u.activo) return res.status(400).json({ error: 'El código ha caducado o no existe. Pide uno nuevo.' });
  const r = comprobarCodigo(u.id, 'recuperar', req.body?.codigo, false);
  if (r.error) { auditar(quien(u, req), 'recuperacion.codigo_fallido', r.error, 'aviso'); return res.status(400).json({ error: r.error }); }
  res.json({ ok: true });
});

seguridadPublica.post('/recuperar/confirmar', (req, res) => {
  const u = usuarioPorNombre(req.body?.usuario);
  const clave = String(req.body?.password || '');
  if (!u || !u.activo) return res.status(400).json({ error: 'El código ha caducado o no existe. Pide uno nuevo.' });
  if (clave !== String(req.body?.confirmar || '')) return res.status(400).json({ error: 'Las contraseñas no coinciden.' });
  const ep = errorPassword(clave);
  if (ep) return res.status(400).json({ error: ep });
  const r = comprobarCodigo(u.id, 'recuperar', req.body?.codigo, true);
  if (r.error) { auditar(quien(u, req), 'recuperacion.codigo_fallido', r.error, 'aviso'); return res.status(400).json({ error: r.error }); }
  db.prepare("UPDATE usuarios SET hash = ?, intentos = 0, bloqueado_hasta = 0, ultimo_login = datetime('now') WHERE id = ?").run(hashPassword(clave), u.id);
  db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(u.id);
  auditar(quien(u, req), 'recuperacion.clave_restablecida', 'Cuenta desbloqueada y sesiones cerradas', 'alerta');
  enviarWhatsApp(u.telefono, `Se ha cambiado la contraseña de tu cuenta de ${NOMBRE_APP}. Si no has sido tú, avisa al administrador cuanto antes.`).catch(() => {});
  crearSesion(res, req, u.id);
  res.json({ ok: true });
});

seguridadPublica.post('/passkeys/acceso/opciones', async (req, res) => {
  const { id: rpID, disponible } = rp(req);
  if (!disponible) return res.status(400).json({ error: 'Las passkeys solo funcionan desde una dirección con dominio y HTTPS.' });
  if (!limiteIp('pk:' + req.ip, 60)) return res.status(429).json({ error: 'Demasiados intentos. Inténtalo más tarde.' });
  const opciones = await generateAuthenticationOptions({ rpID, userVerification: 'preferred', allowCredentials: [] });
  const id = crypto.randomBytes(16).toString('hex');
  guardarDesafio(id, { challenge: opciones.challenge, tipo: 'acceso' });
  res.json({ id, opciones });
});

seguridadPublica.post('/passkeys/acceso/verificar', async (req, res) => {
  const { id: rpID, origen } = rp(req);
  const d = tomarDesafio(String(req.body?.id || ''));
  const resp = req.body?.respuesta;
  if (!d || d.tipo !== 'acceso' || !resp?.id) return res.status(400).json({ error: 'La solicitud ha caducado. Vuelve a intentarlo.' });
  const pk = db.prepare('SELECT * FROM passkeys WHERE id = ?').get(String(resp.id));
  if (!pk) { auditar({ ip: req.ip }, 'passkey.desconocida', '', 'aviso'); return res.status(400).json({ error: 'Esta passkey no está registrada. Entra con tu contraseña y créala de nuevo en «Mi cuenta».' }); }
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(pk.usuario_id);
  if (!u || !u.activo) return res.status(403).json({ error: 'Usuario desactivado' });
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response: resp, expectedChallenge: d.challenge, expectedOrigin: origen, expectedRPID: rpID, requireUserVerification: false,
      credential: { id: pk.id, publicKey: new Uint8Array(pk.clave_publica), counter: pk.contador, transports: JSON.parse(pk.transportes || '[]') },
    });
  } catch (e) { v = { verified: false, error: e.message }; }
  if (!v.verified) { auditar(quien(u, req), 'passkey.fallida', v.error || '', 'alerta'); return res.status(400).json({ error: 'No se pudo comprobar la passkey.' }); }
  db.prepare("UPDATE passkeys SET contador = ?, ultimo_uso = datetime('now') WHERE id = ?").run(v.authenticationInfo.newCounter, pk.id);
  // Una passkey no se puede adivinar: el bloqueo por contraseñas fallidas no impide entrar con ella
  db.prepare("UPDATE usuarios SET intentos = 0, bloqueado_hasta = 0, ultimo_login = datetime('now') WHERE id = ?").run(u.id);
  auditar(quien(u, req), 'login.passkey', pk.nombre);
  crearSesion(res, req, u.id);
  res.json({ ok: true });
});

// ================= Guardia: teléfono sin verificar =================
const PERMITIDAS = new Set(['/estado', '/logout', '/apariencia', '/cuenta/telefono', '/cuenta/telefono/verificar']);
export function exigirTelefonoVerificado(req, res, next) {
  if (!req.usuario || PERMITIDAS.has(req.path) || req.path.startsWith('/apariencia/')) return next();
  const u = db.prepare('SELECT telefono_verificado FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!debeVerificar(u)) return next();
  res.status(403).json({ error: 'Antes de continuar tienes que verificar tu número de teléfono.', verificarTelefono: true });
}

// ================= Rutas con sesión =================
export const seguridadPrivada = Router();
// Cada ruta lleva requiereSesion: un use() sin ruta afectaría también a las rutas públicas montadas después

seguridadPrivada.get('/cuenta', requiereSesion, (req, res) => {
  const u = db.prepare('SELECT telefono, telefono_verificado FROM usuarios WHERE id = ?').get(req.usuario.id);
  res.json({ telefono: ocultarTelefono(u.telefono), telefono_verificado: !!u.telefono_verificado, whatsapp: whatsappActivo(),
    passkeys_disponibles: passkeysDisponibles(req), passkeys: passkeysDe(req.usuario.id).map(publica) });
});

seguridadPrivada.post('/cuenta/telefono', requiereSesion, async (req, res) => {
  if (!whatsappActivo()) return res.status(503).json({ error: 'El envío por WhatsApp no está configurado.' });
  const tel = normalizarTelefono(req.body?.telefono);
  if (!tel) return res.status(400).json({ error: 'El número no es válido. Escríbelo con el prefijo del país si no es español (p. ej. +351…).' });
  if (!limiteIp('tel:' + req.ip, 15)) return res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo más tarde.' });
  const lim = limiteUsuario(req.usuario.id, 'verificar');
  if (lim) return res.status(429).json({ error: lim });
  const codigo = crearCodigo(req.usuario.id, 'verificar', tel);
  try {
    await enviarCodigo(tel, `Este es tu código para verificar tu teléfono en ${NOMBRE_APP}: ${codigo}. ¿No has sido tú? Ignora este mensaje.`, codigo);
  } catch (e) {
    db.prepare("UPDATE codigos SET usado = 1 WHERE usuario_id = ? AND tipo = 'verificar'").run(req.usuario.id);
    auditar(req, 'telefono.error_envio', e.message, 'alerta');
    return res.status(502).json({ error: 'No se pudo enviar el WhatsApp. Comprueba el número (debe tener WhatsApp) o inténtalo en unos minutos.' });
  }
  auditar(req, 'telefono.codigo_enviado', ocultarTelefono(tel));
  res.json({ ok: true, telefono: ocultarTelefono(tel) });
});

seguridadPrivada.post('/cuenta/telefono/verificar', requiereSesion, (req, res) => {
  const r = comprobarCodigo(req.usuario.id, 'verificar', req.body?.codigo, true);
  if (r.error) return res.status(400).json({ error: r.error });
  db.prepare('UPDATE usuarios SET telefono = ?, telefono_verificado = 1 WHERE id = ?').run(r.destino, req.usuario.id);
  auditar(req, 'telefono.verificado', ocultarTelefono(r.destino));
  res.json({ ok: true, telefono: ocultarTelefono(r.destino) });
});

seguridadPrivada.post('/cuenta/clave', requiereSesion, (req, res) => {
  const u = db.prepare('SELECT hash FROM usuarios WHERE id = ?').get(req.usuario.id);
  const nueva = String(req.body?.nueva || '');
  if (!verifyPassword(String(req.body?.actual || ''), u.hash)) { auditar(req, 'clave.cambio_fallido', '', 'aviso'); return res.status(400).json({ error: 'La contraseña actual no es correcta.' }); }
  if (nueva !== String(req.body?.confirmar || '')) return res.status(400).json({ error: 'Las contraseñas nuevas no coinciden.' });
  const ep = errorPassword(nueva);
  if (ep) return res.status(400).json({ error: ep });
  db.prepare('UPDATE usuarios SET hash = ? WHERE id = ?').run(hashPassword(nueva), req.usuario.id);
  db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?').run(req.usuario.id, req.sesionHash || '');
  auditar(req, 'clave.cambiada', '', 'aviso');
  res.json({ ok: true });
});

seguridadPrivada.post('/passkeys/registro/opciones', requiereSesion, async (req, res) => {
  const { id: rpID, disponible } = rp(req);
  if (!disponible) return res.status(400).json({ error: 'Las passkeys solo funcionan desde una dirección con dominio y HTTPS.' });
  const opciones = await generateRegistrationOptions({
    rpName: NOMBRE_APP, rpID, userID: Buffer.from(`facturador-${req.usuario.id}`), userName: req.usuario.usuario, userDisplayName: req.usuario.nombre,
    attestationType: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    excludeCredentials: passkeysDe(req.usuario.id).map((p) => ({ id: p.id, transports: JSON.parse(p.transportes || '[]') })),
  });
  guardarDesafio('reg:' + req.usuario.id, { challenge: opciones.challenge, tipo: 'registro' });
  res.json(opciones);
});

seguridadPrivada.post('/passkeys/registro/verificar', requiereSesion, async (req, res) => {
  const { id: rpID, origen } = rp(req);
  const d = tomarDesafio('reg:' + req.usuario.id);
  if (!d) return res.status(400).json({ error: 'La solicitud ha caducado. Vuelve a intentarlo.' });
  let v;
  try { v = await verifyRegistrationResponse({ response: req.body?.respuesta, expectedChallenge: d.challenge, expectedOrigin: origen, expectedRPID: rpID, requireUserVerification: false }); }
  catch (e) { return res.status(400).json({ error: 'No se pudo registrar la passkey: ' + e.message }); }
  if (!v.verified) return res.status(400).json({ error: 'No se pudo registrar la passkey.' });
  const { credential, credentialBackedUp } = v.registrationInfo;
  const nombre = String(req.body?.nombre || '').trim().slice(0, 60) || nombreDispositivo(req.headers['user-agent']);
  try {
    db.prepare('INSERT INTO passkeys(id, usuario_id, clave_publica, contador, transportes, nombre, sincronizada) VALUES (?,?,?,?,?,?,?)')
      .run(credential.id, req.usuario.id, Buffer.from(credential.publicKey), credential.counter, JSON.stringify(credential.transports || []), nombre, credentialBackedUp ? 1 : 0);
  } catch { return res.status(400).json({ error: 'Esta passkey ya está registrada.' }); }
  auditar(req, 'passkey.creada', nombre, 'aviso');
  res.json({ ok: true, passkeys: passkeysDe(req.usuario.id).map(publica) });
});

seguridadPrivada.delete('/passkeys/:id', requiereSesion, (req, res) => {
  const pk = db.prepare('SELECT * FROM passkeys WHERE id = ? AND usuario_id = ?').get(String(req.params.id), req.usuario.id);
  if (!pk) return res.status(404).json({ error: 'Passkey no encontrada.' });
  db.prepare('DELETE FROM passkeys WHERE id = ?').run(pk.id);
  auditar(req, 'passkey.eliminada', pk.nombre, 'aviso');
  res.json({ ok: true, passkeys: passkeysDe(req.usuario.id).map(publica) });
});

// ---- Administración ----
seguridadPrivada.delete('/usuarios/:id/passkeys', requiereSesion, requiereAdmin, (req, res) => {
  const u = db.prepare('SELECT usuario FROM usuarios WHERE id = ?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'No encontrado' });
  const n = db.prepare('DELETE FROM passkeys WHERE usuario_id = ?').run(Number(req.params.id)).changes;
  auditar(req, 'passkey.revocadas', `${n} de ${u.usuario}`, 'aviso');
  res.json({ ok: true, eliminadas: n });
});

seguridadPrivada.get('/ajustes/whatsapp', requiereSesion, requiereAdmin, (_req, res) => {
  const a = getAjuste('whatsapp', {}) || {};
  res.json({ url: a.url || '', exigir: a.exigir !== false, desde_entorno: !!process.env.WHATSAPP_API });
});
seguridadPrivada.put('/ajustes/whatsapp', requiereSesion, requiereAdmin, (req, res) => {
  const url = String(req.body?.url || '').trim().replace(/\/$/, '');
  if (url && !/^https?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(url)) return res.status(400).json({ error: 'La dirección del puente no es válida (p. ej. http://127.0.0.1:8765).' });
  setAjuste('whatsapp', { url, exigir: req.body?.exigir !== false });
  auditar(req, 'ajustes.whatsapp', url ? `Puente: ${url}` : 'Desactivado', 'aviso');
  res.json({ ok: true });
});
seguridadPrivada.post('/ajustes/whatsapp/prueba', requiereSesion, requiereAdmin, async (req, res) => {
  const tel = normalizarTelefono(req.body?.telefono);
  if (!tel) return res.status(400).json({ error: 'Indica un teléfono válido.' });
  try { await enviarWhatsApp(tel, `Mensaje de prueba de ${NOMBRE_APP}: el envío por WhatsApp funciona.`, String(req.body?.url || '').replace(/\/$/, '') || urlWhatsApp()); }
  catch (e) { return res.status(502).json({ error: e.message }); }
  res.json({ ok: true });
});
