// Autenticación: contraseñas con scrypt, sesiones con token aleatorio en cookie HttpOnly.
import crypto from 'node:crypto';
import { db } from './db.mjs';

const SESION_MS = 1000 * 60 * 60 * 12; // 12 h
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 1000 * 60 * 15;
export const COOKIE = 'fx_sid';

// scrypt con coste N=16384, r=8, p=1, sal aleatoria de 32 bytes y clave de 64 bytes (igual que Gestor DeCA)
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SAL_BYTES = 32;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(SAL_BYTES);
  const key = crypto.scryptSync(pw, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  try {
    const expected = Buffer.from(keyHex, 'hex');
    const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length || 64, SCRYPT);
    return expected.length === key.length && crypto.timingSafeEqual(expected, key);
  } catch {
    return false;
  }
}

/** Indica si un hash se creó con parámetros más débiles que los actuales y conviene regenerarlo. */
function necesitaRehash(stored) {
  const [, saltHex] = String(stored).split('$');
  return !saltHex || saltHex.length < SAL_BYTES * 2;
}

const MSG_BLOQUEO = 'Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo en 15 minutos, entra con tu passkey o restablece la contraseña.';
const HASH_FICTICIO = hashPassword(crypto.randomBytes(16).toString('hex'));

/** Política de contraseñas: devuelve el motivo del rechazo o null si es válida. */
export function errorPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'La contraseña debe tener al menos 10 caracteres';
  if (pw.length > 200) return 'La contraseña es demasiado larga';
  if (!/[A-Z]/.test(pw)) return 'La contraseña debe tener al menos una mayúscula';
  if (!/[a-z]/.test(pw)) return 'La contraseña debe tener al menos una minúscula';
  if (!/\d/.test(pw)) return 'La contraseña debe tener al menos un número';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'La contraseña debe tener al menos un símbolo (!@#$%…)';
  return null;
}

// Bloqueo por IP tras varios fallos de inicio de sesión (además del bloqueo por cuenta)
const IP_MAX_FALLOS = 10;
const IP_BLOQUEO_MS = 15 * 60 * 1000;
const fallosIp = new Map();
export function ipBloqueada(ip) {
  const r = fallosIp.get(ip);
  return r && r.hasta > Date.now() ? Math.ceil((r.hasta - Date.now()) / 60000) : 0;
}
function registrarFalloIp(ip) {
  const r = fallosIp.get(ip) || { n: 0, hasta: 0, ultimo: 0 };
  r.n = Date.now() - r.ultimo > IP_BLOQUEO_MS ? 1 : r.n + 1;
  r.ultimo = Date.now();
  if (r.n >= IP_MAX_FALLOS) { r.hasta = Date.now() + IP_BLOQUEO_MS; r.n = 0; }
  fallosIp.set(ip, r);
  return r.hasta > Date.now();
}
setInterval(() => {
  for (const [ip, r] of fallosIp) if (Date.now() - r.ultimo > 3_600_000 && r.hasta < Date.now()) fallosIp.delete(ip);
}, 10 * 60 * 1000).unref();

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

function leerCookie(req, nombre) {
  const raw = req.headers.cookie || '';
  for (const parte of raw.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function crearSesion(res, req, usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sesiones(token_hash, usuario_id, expira) VALUES (?,?,?)')
    .run(sha(token), usuarioId, Date.now() + SESION_MS);
  const segura = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESION_MS / 1000}${segura ? '; Secure' : ''}`);
}

export function cerrarSesion(req, res) {
  const token = leerCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(sha(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`);
}

/**
 * Comprueba credenciales. Devuelve { usuario } o { error, evento, severidad } para la auditoría.
 */
export function login(usuario, password, ip) {
  const minutos = ipBloqueada(ip);
  if (minutos) return { error: `Demasiados intentos desde esta dirección. Espera ${minutos} min.`, evento: 'login.ip_bloqueada', severidad: 'alerta' };
  const pw = String(password || '').slice(0, 200);
  const u = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(String(usuario || '').slice(0, 50));
  if (!u) {
    verifyPassword(pw, HASH_FICTICIO); // tiempo constante: no revela si el usuario existe
    const bloq = registrarFalloIp(ip);
    return { error: 'Usuario o contraseña incorrectos', evento: bloq ? 'login.ip_bloqueada' : 'login.fallido', severidad: bloq ? 'alerta' : 'aviso' };
  }
  if (u.bloqueado_hasta > Date.now()) {
    verifyPassword(pw, HASH_FICTICIO);
    return { error: MSG_BLOQUEO, evento: 'login.cuenta_bloqueada', severidad: 'aviso', bloqueada: true };
  }
  if (!verifyPassword(pw, u.hash)) {
    const intentos = u.intentos + 1;
    const bloqueo = intentos >= MAX_INTENTOS ? Date.now() + BLOQUEO_MS : 0;
    db.prepare('UPDATE usuarios SET intentos = ?, bloqueado_hasta = ? WHERE id = ?').run(bloqueo ? 0 : intentos, bloqueo, u.id);
    registrarFalloIp(ip);
    return bloqueo
      ? { error: MSG_BLOQUEO, evento: 'login.cuenta_bloqueada', severidad: 'alerta', bloqueada: true }
      : { error: 'Usuario o contraseña incorrectos', evento: 'login.fallido', severidad: 'aviso' };
  }
  if (!u.activo) return { error: 'Usuario desactivado', evento: 'login.desactivado', severidad: 'aviso' };
  const nuevoHash = necesitaRehash(u.hash) ? hashPassword(pw) : u.hash;
  db.prepare("UPDATE usuarios SET intentos = 0, bloqueado_hasta = 0, hash = ?, ultimo_login = datetime('now') WHERE id = ?").run(nuevoHash, u.id);
  return { usuario: u };
}

// Middleware: carga el usuario de la sesión si existe.
export function cargarUsuario(req, _res, next) {
  const token = leerCookie(req, COOKIE);
  if (token) {
    const r = db.prepare(`SELECT u.id, u.usuario, u.nombre, u.email, u.rol, u.telefono_verificado, s.expira
      FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ? AND u.activo = 1`).get(sha(token));
    if (r && r.expira > Date.now()) {
      const { expira, telefono_verificado, ...usuario } = r;
      req.usuario = usuario;
      req.telefonoVerificado = !!telefono_verificado;
      req.sesionHash = sha(token);
    }
  }
  next();
}

export function requiereSesion(req, res, next) {
  if (!req.usuario) return res.status(401).json({ error: 'Sesión no iniciada' });
  next();
}

export function requiereAdmin(req, res, next) {
  if (!req.usuario) return res.status(401).json({ error: 'Sesión no iniciada' });
  if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo para administradores' });
  next();
}

// Limpieza periódica de sesiones caducadas
setInterval(() => db.prepare('DELETE FROM sesiones WHERE expira < ?').run(Date.now()), 60 * 60 * 1000).unref();
