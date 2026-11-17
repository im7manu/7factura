// Cifrado de secretos en reposo (tokens de Google/Microsoft, contraseñas SMTP, credenciales de aplicaciones).
// AES-256-GCM con una clave maestra: la variable FACTURADOR_SECRET o, si no existe, un archivo
// DATA_DIR/secreto.key generado al primer arranque (permisos 600). Sin esa clave los secretos no se pueden leer:
// inclúyela en tus copias de seguridad junto con la base de datos.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../db.mjs';

function claveMaestra() {
  if (process.env.FACTURADOR_SECRET) return crypto.createHash('sha256').update(process.env.FACTURADOR_SECRET).digest();
  const archivo = path.join(DATA_DIR, 'secreto.key');
  if (!fs.existsSync(archivo)) fs.writeFileSync(archivo, crypto.randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
  return Buffer.from(fs.readFileSync(archivo, 'utf8').trim(), 'base64');
}
const CLAVE = claveMaestra();

export function cifrar(texto) {
  if (texto == null || texto === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', CLAVE, iv);
  const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${datos.toString('base64')}`;
}

export function descifrar(valor) {
  if (!valor) return null;
  const [v, iv, tag, datos] = String(valor).split(':');
  if (v !== 'v1') return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', CLAVE, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
