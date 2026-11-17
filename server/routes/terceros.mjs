// Clientes, proveedores, vehículos y conductores.
// Todos llevan un uid estable y la fecha de última modificación para poder compartirlos con
// Gestor DeCA y eCMR (mismos campos: NIF de empresas, matrícula de vehículos, DNI de conductores).
import { Router } from 'express';
import crypto from 'node:crypto';
import { db, auditar } from '../db.mjs';
import { requiereAdmin } from '../auth.mjs';
import { validarNif, normalizarNif } from '../lib/nif.mjs';
import { OPERACIONES } from '../lib/totales.mjs';
import { limpiarPlazos } from './cobros.mjs';

export const router = Router();

const texto = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const envolver = (fn) => (req, res) => {
  try { fn(req, res); } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un registro con ese identificador' });
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
};
const conPlazos = (r) => (r ? { ...r, plazos: r.plazos ? JSON.parse(r.plazos) : null } : r);

// ---------- Clientes y proveedores (misma estructura) ----------
function datosTercero(b) {
  const c = {
    nombre: texto(b.nombre, 200), nif: normalizarNif(b.nif), direccion: texto(b.direccion, 200), cp: texto(b.cp, 10),
    ciudad: texto(b.ciudad, 100), provincia: texto(b.provincia, 100), pais: (texto(b.pais, 2) || 'ES').toUpperCase(),
    email: texto(b.email, 150), telefono: texto(b.telefono, 30), forma_pago: texto(b.forma_pago, 10) || null, notas: texto(b.notas, 2000),
    operacion: Object.hasOwn(OPERACIONES, b.operacion) ? b.operacion : 'S1', recargo: b.recargo ? 1 : 0,
    dias_pago: String(b.dias_pago || '').split(/[,\s;]+/).map(Number).filter((n) => n >= 1 && n <= 31).join(','),
  };
  if (!c.nombre) throw err('El nombre es obligatorio');
  if (c.nif && c.pais === 'ES' && !validarNif(c.nif).valido) throw err('El NIF no es válido');
  if (c.forma_pago && !db.prepare('SELECT 1 FROM formas_pago WHERE codigo = ?').get(c.forma_pago)) throw err('La forma de pago no existe');
  const pl = limpiarPlazos(b.plazos);
  c.plazos = pl && pl.length > 1 ? JSON.stringify(pl) : null;
  return c;
}

function rutasTercero(tabla, singular, campoDoc, tipoFactura) {
  const COLS = ['nombre', 'nif', 'direccion', 'cp', 'ciudad', 'provincia', 'pais', 'email', 'telefono', 'forma_pago', 'notas', 'operacion', 'recargo', 'plazos', 'dias_pago'];
  const base = `/${tabla}`;

  router.get(base, envolver((req, res) => {
    const q = req.query.q ? `%${req.query.q}%` : '%';
    res.json(db.prepare(`SELECT t.*,
        (SELECT COUNT(*) FROM documentos d WHERE d.${campoDoc} = t.id AND d.tipo = '${tipoFactura}' AND d.numero IS NOT NULL) AS num_facturas,
        (SELECT COALESCE(SUM(total - cobrado), 0) FROM documentos d WHERE d.${campoDoc} = t.id AND d.tipo = '${tipoFactura}' AND d.estado = 'emitida') AS pendiente
      FROM ${tabla} t WHERE t.nombre LIKE ? OR t.nif LIKE ? ORDER BY t.nombre COLLATE NOCASE`).all(q, q).map(conPlazos));
  }));

  router.post(base, envolver((req, res) => {
    const c = datosTercero(req.body);
    const r = db.prepare(`INSERT INTO ${tabla}(uid, ${COLS.join(', ')}, actualizado) VALUES (?, ${COLS.map(() => '?').join(', ')}, datetime('now'))`)
      .run(crypto.randomUUID(), ...COLS.map((k) => c[k]));
    auditar(req, `${singular}.crear`, c.nombre);
    res.status(201).json(conPlazos(db.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(r.lastInsertRowid)));
  }));

  router.put(`${base}/:id`, envolver((req, res) => {
    const c = datosTercero(req.body);
    const r = db.prepare(`UPDATE ${tabla} SET ${COLS.map((k) => `${k} = ?`).join(', ')}, actualizado = datetime('now') WHERE id = ?`)
      .run(...COLS.map((k) => c[k]), Number(req.params.id));
    if (!r.changes) throw err('No encontrado', 404);
    res.json(conPlazos(db.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(req.params.id)));
  }));

  router.delete(`${base}/:id`, envolver((req, res) => {
    if (db.prepare(`SELECT 1 FROM documentos WHERE ${campoDoc} = ? LIMIT 1`).get(req.params.id)) throw err(`El ${singular} tiene documentos y no se puede borrar`, 409);
    const c = db.prepare(`SELECT nombre, nif FROM ${tabla} WHERE id = ?`).get(req.params.id);
    db.prepare(`DELETE FROM ${tabla} WHERE id = ?`).run(req.params.id);
    if (c) auditar(req, `${singular}.borrar`, `${c.nombre} ${c.nif}`, 'aviso');
    res.json({ ok: true });
  }));
}

rutasTercero('clientes', 'cliente', 'cliente_id', 'factura');
rutasTercero('proveedores', 'proveedor', 'proveedor_id', 'factura_compra');

// ---------- Vehículos (mismos tipos y estados que Gestor DeCA) ----------
export const TIPOS_VEHICULO = ['Tractora', 'Rígido', 'Remolque', 'Semirremolque', 'Furgoneta', 'Turismo', 'Otro'];
export const ESTADOS_VEHICULO = ['Disponible', 'En ruta', 'Taller', 'Baja'];

function datosVehiculo(b) {
  const v = {
    matricula: texto(b.matricula, 15).toUpperCase().replace(/[\s-]/g, ''),
    tipo: TIPOS_VEHICULO.includes(b.tipo) ? b.tipo : 'Tractora',
    modelo: texto(b.modelo, 100),
    estado: ESTADOS_VEHICULO.includes(b.estado) ? b.estado : 'Disponible',
    itv: /^\d{4}-\d{2}-\d{2}$/.test(b.itv || '') ? b.itv : '',
    notas: texto(b.notas, 1000),
    activo: b.activo === false ? 0 : 1,
  };
  if (!/^[A-Z0-9]{4,12}$/.test(v.matricula)) throw err('Matrícula no válida');
  return v;
}

router.get('/vehiculos', envolver((req, res) => {
  const anio = Number(req.query.anio) || new Date().getFullYear();
  res.json(db.prepare(`SELECT v.*,
      (SELECT COALESCE(SUM(ROUND(l.cantidad * l.precio * (1 - l.dto / 100.0), 2)), 0) FROM lineas l JOIN documentos d ON d.id = l.documento_id
        WHERE l.vehiculo_id = v.id AND d.tipo IN ('factura_compra', 'gasto') AND d.numero IS NOT NULL AND d.ejercicio = ?) AS gasto_anio
    FROM vehiculos v ORDER BY v.activo DESC, v.matricula`).all(anio));
}));
router.post('/vehiculos', envolver((req, res) => {
  const v = datosVehiculo(req.body);
  const r = db.prepare(`INSERT INTO vehiculos(uid, matricula, tipo, modelo, estado, itv, notas, activo) VALUES (?,?,?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), v.matricula, v.tipo, v.modelo, v.estado, v.itv, v.notas, v.activo);
  auditar(req, 'vehiculo.crear', v.matricula);
  res.status(201).json(db.prepare('SELECT * FROM vehiculos WHERE id = ?').get(r.lastInsertRowid));
}));
router.put('/vehiculos/:id', envolver((req, res) => {
  const v = datosVehiculo(req.body);
  const r = db.prepare(`UPDATE vehiculos SET matricula=?, tipo=?, modelo=?, estado=?, itv=?, notas=?, activo=?, actualizado=datetime('now') WHERE id = ?`)
    .run(v.matricula, v.tipo, v.modelo, v.estado, v.itv, v.notas, v.activo, Number(req.params.id));
  if (!r.changes) throw err('No encontrado', 404);
  res.json(db.prepare('SELECT * FROM vehiculos WHERE id = ?').get(req.params.id));
}));
router.delete('/vehiculos/:id', envolver((req, res) => {
  if (db.prepare('SELECT 1 FROM lineas WHERE vehiculo_id = ? LIMIT 1').get(req.params.id)) throw err('El vehículo tiene gastos asignados. Desactívalo en lugar de borrarlo.', 409);
  const v = db.prepare('SELECT matricula FROM vehiculos WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM vehiculos WHERE id = ?').run(req.params.id);
  if (v) auditar(req, 'vehiculo.borrar', v.matricula, 'aviso');
  res.json({ ok: true });
}));

// ---------- Conductores (mismos campos que Gestor DeCA) ----------
function datosConductor(b) {
  const c = { nombre: texto(b.nombre, 120), dni: normalizarNif(b.dni), telefono: texto(b.telefono, 30), email: texto(b.email, 150), activo: b.activo === false ? 0 : 1 };
  if (!c.nombre) throw err('El nombre es obligatorio');
  if (!validarNif(c.dni).valido) throw err('El DNI/NIE no es válido');
  return c;
}
router.get('/conductores', envolver((_req, res) => res.json(db.prepare('SELECT * FROM conductores ORDER BY activo DESC, nombre COLLATE NOCASE').all())));
router.post('/conductores', envolver((req, res) => {
  const c = datosConductor(req.body);
  const r = db.prepare('INSERT INTO conductores(uid, nombre, dni, telefono, email, activo) VALUES (?,?,?,?,?,?)')
    .run(crypto.randomUUID(), c.nombre, c.dni, c.telefono, c.email, c.activo);
  res.status(201).json(db.prepare('SELECT * FROM conductores WHERE id = ?').get(r.lastInsertRowid));
}));
router.put('/conductores/:id', envolver((req, res) => {
  const c = datosConductor(req.body);
  const r = db.prepare("UPDATE conductores SET nombre=?, dni=?, telefono=?, email=?, activo=?, actualizado=datetime('now') WHERE id = ?")
    .run(c.nombre, c.dni, c.telefono, c.email, c.activo, Number(req.params.id));
  if (!r.changes) throw err('No encontrado', 404);
  res.json(db.prepare('SELECT * FROM conductores WHERE id = ?').get(req.params.id));
}));
router.delete('/conductores/:id', envolver((req, res) => {
  db.prepare('DELETE FROM conductores WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- Datos compartidos (base para la futura conexión con Gestor DeCA y eCMR) ----------
// Formato neutro: uid estable, clave natural (NIF / matrícula / DNI) y fecha de modificación.
// ?desde=AAAA-MM-DD HH:MM:SS devuelve solo lo modificado después (sincronización incremental).
const COMPARTIDO = {
  clientes: { sql: 'SELECT uid, nombre, nif, direccion, cp, ciudad, provincia, pais, email, telefono, actualizado FROM clientes', clave: 'nif' },
  proveedores: { sql: 'SELECT uid, nombre, nif, direccion, cp, ciudad, provincia, pais, email, telefono, actualizado FROM proveedores', clave: 'nif' },
  vehiculos: { sql: 'SELECT uid, matricula, tipo, modelo, estado, itv, activo, actualizado FROM vehiculos', clave: 'matricula' },
  conductores: { sql: 'SELECT uid, nombre, dni, telefono, email, activo, actualizado FROM conductores', clave: 'dni' },
};
router.get('/compartido/:entidad', requiereAdmin, envolver((req, res) => {
  const e = COMPARTIDO[req.params.entidad];
  if (!e) throw err('Entidad no válida', 404);
  const desde = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(req.query.desde || '') ? req.query.desde : null;
  const filas = desde ? db.prepare(`${e.sql} WHERE actualizado > ? ORDER BY actualizado`).all(desde) : db.prepare(`${e.sql} ORDER BY actualizado`).all();
  res.json({ entidad: req.params.entidad, clave: e.clave, version: 1, generado: new Date().toISOString(), registros: filas });
}));
