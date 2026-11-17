// Archivos adjuntos a documentos y clientes.
// Los archivos se guardan en DATA_DIR/adjuntos con un nombre aleatorio; el nombre original solo se usa al descargar.
import express, { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, auditar } from '../db.mjs';

export const router = Router();

const CARPETA = path.join(DATA_DIR, 'adjuntos');
fs.mkdirSync(CARPETA, { recursive: true });
const MAX_BYTES = 15 * 1024 * 1024;

// Tipos permitidos: extensión → tipo MIME con el que se guarda y se sirve
const PERMITIDOS = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', txt: 'text/plain', csv: 'text/csv', xml: 'application/xml', zip: 'application/zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
};
const ENTIDADES = { documento: 'documentos', cliente: 'clientes', proveedor: 'proveedores' };

/** Ruta absoluta del archivo, comprobando que está dentro de la carpeta de adjuntos (evita path traversal). */
function rutaSegura(archivo) {
  if (!/^[a-f0-9]{48}$/.test(archivo)) throw new Error('Nombre de archivo no válido');
  const abs = path.resolve(CARPETA, archivo);
  if (!abs.startsWith(CARPETA + path.sep)) throw new Error('Ruta no permitida');
  return abs;
}

function entidadValida(entidad, id) {
  const tabla = ENTIDADES[entidad];
  if (!tabla) return false;
  try {
    return !!db.prepare(`SELECT 1 FROM ${tabla} WHERE id = ?`).get(Number(id));
  } catch {
    return false;
  }
}

router.get('/', (req, res) => {
  const { entidad, id } = req.query;
  if (!ENTIDADES[entidad]) return res.status(400).json({ error: 'Entidad no válida' });
  res.json(db.prepare(`SELECT a.id, a.nombre, a.mime, a.tamano, a.creado, u.nombre AS subido_por
    FROM adjuntos a LEFT JOIN usuarios u ON u.id = a.subido_por
    WHERE a.entidad = ? AND a.entidad_id = ? ORDER BY a.id DESC`).all(entidad, Number(id)));
});

router.post('/', express.raw({ type: () => true, limit: MAX_BYTES }), (req, res) => {
  const { entidad, id } = req.query;
  if (!entidadValida(entidad, id)) return res.status(400).json({ error: 'El documento o cliente no existe' });
  let nombre = '';
  try { nombre = decodeURIComponent(String(req.headers['x-nombre-archivo'] || '')); } catch { nombre = ''; }
  nombre = path.basename(nombre).replace(/[\u0000-\u001f"\\/]/g, '').slice(0, 150);
  const ext = nombre.split('.').pop()?.toLowerCase() || '';
  if (!nombre || !PERMITIDOS[ext]) return res.status(400).json({ error: `Tipo de archivo no permitido. Admitidos: ${Object.keys(PERMITIDOS).join(', ')}` });
  const datos = req.body;
  if (!Buffer.isBuffer(datos) || !datos.length) return res.status(400).json({ error: 'El archivo está vacío' });

  const archivo = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(rutaSegura(archivo), datos, { flag: 'wx' });
  const sha256 = crypto.createHash('sha256').update(datos).digest('hex');
  const r = db.prepare(`INSERT INTO adjuntos(entidad, entidad_id, nombre, mime, tamano, archivo, sha256, subido_por)
    VALUES (?,?,?,?,?,?,?,?)`).run(entidad, Number(id), nombre, PERMITIDOS[ext], datos.length, archivo, sha256, req.usuario.id);
  auditar(req, 'adjunto.subir', `${entidad}=${id} ${nombre}`);
  res.status(201).json({ id: Number(r.lastInsertRowid), nombre, tamano: datos.length });
});

router.get('/:id/descargar', (req, res) => {
  const a = db.prepare('SELECT * FROM adjuntos WHERE id = ?').get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'No encontrado' });
  let abs;
  try { abs = rutaSegura(a.archivo); } catch { return res.status(400).json({ error: 'Archivo no válido' }); }
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'El archivo ya no existe en el servidor' });
  // PDF e imágenes se pueden ver en el navegador; el resto siempre se descarga
  const enLinea = req.query.ver === '1' && /^(application\/pdf|image\/(png|jpeg|webp|gif))$/.test(a.mime);
  res.setHeader('Content-Type', a.mime);
  // El visor de PDF del navegador no funciona dentro de un CSP con sandbox; el resto de tipos se aíslan
  if (a.mime !== 'application/pdf') res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Content-Disposition', `${enLinea ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.nombre)}`);
  fs.createReadStream(abs).pipe(res);
});

router.delete('/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM adjuntos WHERE id = ?').get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'No encontrado' });
  db.prepare('DELETE FROM adjuntos WHERE id = ?').run(a.id);
  try { fs.rmSync(rutaSegura(a.archivo), { force: true }); } catch { /* ya no existe */ }
  auditar(req, 'adjunto.borrar', `${a.entidad}=${a.entidad_id} ${a.nombre}`, 'aviso');
  res.json({ ok: true });
});

/** Guarda un archivo generado por la propia aplicación (p. ej. la firma de un albarán). Devuelve el id del adjunto. */
export function guardarAdjunto({ entidad, entidadId, nombre, mime, datos, usuarioId }) {
  const archivo = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(rutaSegura(archivo), datos, { flag: 'wx' });
  const sha256 = crypto.createHash('sha256').update(datos).digest('hex');
  return Number(db.prepare(`INSERT INTO adjuntos(entidad, entidad_id, nombre, mime, tamano, archivo, sha256, subido_por)
    VALUES (?,?,?,?,?,?,?,?)`).run(entidad, entidadId, nombre, mime, datos.length, archivo, sha256, usuarioId ?? null).lastInsertRowid);
}

/** Ruta en disco de un adjunto (para incrustarlo en un PDF). */
export function rutaAdjunto(id) {
  const a = db.prepare('SELECT archivo FROM adjuntos WHERE id = ?').get(Number(id));
  if (!a) return null;
  try {
    const abs = rutaSegura(a.archivo);
    return fs.existsSync(abs) ? abs : null;
  } catch {
    return null;
  }
}
