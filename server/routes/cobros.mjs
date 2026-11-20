// Recibos (vencimientos), cobros y avisos de cobro.
import { Router } from 'express';
import { db, getAjuste, setAjuste, transaccion, auditar } from '../db.mjs';
import { requiereAdmin } from '../auth.mjs';
import { r2 } from '../lib/totales.mjs';

export const router = Router();

/** Opciones de cobro configurables por la empresa (Ajustes → Cobros). */
export const COBROS_DEFECTO = {
  recibos_por_plazos: true,     // dividir la factura en varios vencimientos según los plazos
  cobros_parciales: true,       // permitir cobrar una parte de un recibo
  menu_cobros: true,            // mostrar el listado «Cobros» en el menú
  panel_en_factura: true,       // mostrar vencimientos y cobros dentro de la factura
  vencimientos_en_pdf: true,    // imprimir los vencimientos en el PDF cuando hay más de uno
  avisos: true,                 // campana de avisos
  aviso_dias_antes: 3,          // avisar N días antes del vencimiento (0 = no avisar antes)
  aviso_impagado_dias: 1,       // avisar cuando un recibo lleva X días vencido
  avisos_en_inicio: true,       // mostrar los avisos en la pantalla de inicio
};
export const ajustesCobros = () => ({ ...COBROS_DEFECTO, ...getAjuste('cobros', {}) });

const hoy = () => new Date().toLocaleDateString('sv-SE');
const fechaValida = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f));

function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
}

/** Mueve una fecha al siguiente día de pago del cliente (p. ej. días 10 y 25). */
export function ajustarADiasPago(iso, diasPago) {
  const dias = String(diasPago || '').split(/[,\s;]+/).map(Number).filter((n) => n >= 1 && n <= 31).sort((a, b) => a - b);
  if (!dias.length) return iso;
  const d = new Date(`${iso}T12:00:00Z`);
  for (let mes = 0; mes < 3; mes++) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + mes;
    const finMes = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    for (const dia of dias) {
      const c = new Date(Date.UTC(y, m, Math.min(dia, finMes), 12));
      const ci = c.toISOString().slice(0, 10);
      if (ci >= iso) return ci;
    }
  }
  return iso;
}

/** Normaliza y valida una lista de plazos [{dias, pct}]. Los porcentajes deben sumar 100. */
export function limpiarPlazos(plazos) {
  if (plazos == null || plazos === '' || (Array.isArray(plazos) && !plazos.length)) return null;
  if (!Array.isArray(plazos) || plazos.length > 24) throw new Error('Plazos no válidos (máximo 24)');
  const lista = plazos.map((p) => ({ dias: Math.max(0, Math.round(Number(p.dias) || 0)), pct: r2(Number(p.pct) || 0) }));
  if (lista.some((p) => p.pct <= 0)) throw new Error('Cada plazo necesita un porcentaje mayor que 0');
  const suma = r2(lista.reduce((s, p) => s + p.pct, 0));
  if (Math.abs(suma - 100) > 0.05) throw new Error(`Los porcentajes de los plazos deben sumar 100 (ahora suman ${suma})`);
  return lista.sort((a, b) => a.dias - b.dias);
}

/** Calcula los vencimientos de una factura según cliente, forma de pago y opciones. */
export function calcularVencimientos(doc) {
  const total = r2(doc.total);
  const fp = doc.forma_pago ? db.prepare('SELECT * FROM formas_pago WHERE codigo = ?').get(doc.forma_pago) : null;
  const cli = doc.proveedor_id ? db.prepare('SELECT plazos, dias_pago FROM proveedores WHERE id = ?').get(doc.proveedor_id)
    : doc.cliente_id ? db.prepare('SELECT plazos, dias_pago FROM clientes WHERE id = ?').get(doc.cliente_id) : null;
  const opciones = ajustesCobros();
  let plazos = null;
  if (opciones.recibos_por_plazos) {
    plazos = (cli?.plazos && JSON.parse(cli.plazos)) || (fp?.plazos && JSON.parse(fp.plazos)) || null;
  }
  if (!plazos || plazos.length <= 1 || Math.abs(total) < 0.01) {
    const venc = doc.vencimiento || ajustarADiasPago(sumarDias(doc.fecha, plazos?.[0]?.dias ?? fp?.dias ?? 0), cli?.dias_pago);
    return [{ importe: total, vencimiento: venc }];
  }
  let acumulado = 0;
  return plazos.map((p, i) => {
    const importe = i === plazos.length - 1 ? r2(total - acumulado) : r2(total * p.pct / 100);
    acumulado = r2(acumulado + importe);
    return { importe, vencimiento: ajustarADiasPago(sumarDias(doc.fecha, p.dias), cli?.dias_pago) };
  });
}

/** Crea los recibos de una factura recién emitida. */
export function generarRecibos(docId) {
  const doc = db.prepare('SELECT * FROM documentos WHERE id = ?').get(docId);
  db.prepare('DELETE FROM recibos WHERE documento_id = ?').run(docId);
  const ins = db.prepare('INSERT INTO recibos(documento_id, numero, importe, vencimiento, forma_pago) VALUES (?,?,?,?,?)');
  const vencs = calcularVencimientos(doc);
  vencs.forEach((v, i) => ins.run(docId, i + 1, v.importe, v.vencimiento, doc.forma_pago));
  // El vencimiento de la factura es el último de sus recibos
  db.prepare('UPDATE documentos SET vencimiento = ? WHERE id = ?').run(vencs.at(-1).vencimiento, docId);
  actualizarEstadoCobro(docId);
}

/** Recalcula lo cobrado y el estado (emitida / pagada) de una factura a partir de sus cobros. */
export function actualizarEstadoCobro(docId) {
  const d = db.prepare('SELECT total, estado FROM documentos WHERE id = ?').get(docId);
  if (!d || !['emitida', 'pagada'].includes(d.estado)) return;
  const c = db.prepare(`SELECT COALESCE(SUM(c.importe), 0) cobrado, MAX(c.fecha) ultima
    FROM cobros c JOIN recibos r ON r.id = c.recibo_id WHERE r.documento_id = ?`).get(docId);
  const cobrado = r2(c.cobrado);
  const pagada = Math.abs(r2(d.total) - cobrado) < 0.005 && (cobrado !== 0 || r2(d.total) === 0);
  db.prepare('UPDATE documentos SET cobrado = ?, estado = ?, pagada_en = ? WHERE id = ?')
    .run(cobrado, pagada ? 'pagada' : 'emitida', pagada ? (c.ultima || hoy()) : null, docId);
}

/** Recibos de una factura con sus cobros y lo pendiente. */
export function recibosDe(docId) {
  const recibos = db.prepare('SELECT * FROM recibos WHERE documento_id = ? ORDER BY numero').all(docId);
  const cobrosSt = db.prepare(`SELECT c.*, u.nombre AS usuario FROM cobros c LEFT JOIN usuarios u ON u.id = c.usuario_id
    WHERE c.recibo_id = ? ORDER BY c.fecha, c.id`);
  return recibos.map((r) => {
    const cobros = cobrosSt.all(r.id);
    const cobrado = r2(cobros.reduce((s, c) => s + c.importe, 0));
    return { ...r, cobros, cobrado, pendiente: r2(r.importe - cobrado) };
  });
}

/** Cobra todo lo pendiente de una factura (botón «Marcar cobrada»). */
export function cobrarTodo(docId, fecha, usuarioId) {
  const ins = db.prepare('INSERT INTO cobros(recibo_id, fecha, importe, forma_pago, usuario_id) VALUES (?,?,?,?,?)');
  for (const r of recibosDe(docId)) if (Math.abs(r.pendiente) >= 0.005) ins.run(r.id, fecha, r.pendiente, r.forma_pago, usuarioId);
  actualizarEstadoCobro(docId);
}

/** Anula todos los cobros de una factura (botón «Marcar pendiente»). */
export function anularCobros(docId) {
  db.prepare('DELETE FROM cobros WHERE recibo_id IN (SELECT id FROM recibos WHERE documento_id = ?)').run(docId);
  actualizarEstadoCobro(docId);
}

const envolver = (fn) => (req, res) => {
  try { fn(req, res); } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
};
const error = (msg, status = 400) => Object.assign(new Error(msg), { status });

// ---- Opciones ----
router.get('/ajustes', (_req, res) => res.json(ajustesCobros()));
router.put('/ajustes', requiereAdmin, (req, res) => {
  const a = ajustesCobros();
  for (const k of Object.keys(COBROS_DEFECTO)) {
    if (req.body[k] === undefined) continue;
    a[k] = typeof COBROS_DEFECTO[k] === 'boolean' ? !!req.body[k] : Math.max(0, Math.min(365, Math.round(Number(req.body[k]) || 0)));
  }
  setAjuste('cobros', a);
  auditar(req, 'ajustes.cobros', '', 'aviso');
  res.json(a);
});

// ---- Listado de recibos ----
router.get('/recibos', envolver((req, res) => {
  const compras = req.query.ambito === 'compras';
  const where = [compras ? "d.tipo IN ('factura_compra', 'gasto')" : "d.tipo = 'factura'", 'd.numero IS NOT NULL'];
  const p = [];
  const h = hoy();
  const estado = String(req.query.estado || 'pendientes');
  const pendienteSql = 'ROUND(r.importe - COALESCE((SELECT SUM(importe) FROM cobros WHERE recibo_id = r.id), 0), 2)';
  if (estado === 'pendientes') where.push(`ABS(${pendienteSql}) >= 0.005`);
  if (estado === 'vencidos') { where.push(`ABS(${pendienteSql}) >= 0.005`, 'r.vencimiento < ?'); p.push(h); }
  if (estado === 'cobrados') where.push(`ABS(${pendienteSql}) < 0.005`);
  if (fechaValida(req.query.desde)) { where.push('r.vencimiento >= ?'); p.push(req.query.desde); }
  if (fechaValida(req.query.hasta)) { where.push('r.vencimiento <= ?'); p.push(req.query.hasta); }
  if (req.query.cliente_id) { where.push('d.cliente_id = ?'); p.push(Number(req.query.cliente_id)); }
  if (req.query.q) {
    where.push("(d.codigo LIKE ? OR json_extract(d.cliente, '$.nombre') LIKE ? OR json_extract(d.cliente, '$.nif') LIKE ?)");
    const q = `%${req.query.q}%`;
    p.push(q, q, q);
  }
  const filas = db.prepare(`SELECT r.id, r.numero, r.importe, r.vencimiento, r.forma_pago, d.id AS documento_id, d.tipo, d.codigo, d.numero_proveedor, d.fecha,
      (SELECT COUNT(*) FROM recibos x WHERE x.documento_id = d.id) AS num_recibos,
      json_extract(d.cliente, '$.nombre') AS cliente_nombre, json_extract(d.cliente, '$.nif') AS cliente_nif,
      ${pendienteSql} AS pendiente,
      (SELECT MAX(fecha) FROM cobros WHERE recibo_id = r.id) AS ultimo_cobro
    FROM recibos r JOIN documentos d ON d.id = r.documento_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${estado === 'cobrados' ? 'ultimo_cobro DESC' : 'r.vencimiento ASC'}, r.id LIMIT 1000`).all(...p);
  res.json(filas.map((f) => ({ ...f, vencido: f.pendiente !== 0 && f.vencimiento < h })));
}));

// ---- Vencimientos de una factura ----
router.get('/documentos/:id/recibos', envolver((req, res) => res.json(recibosDe(Number(req.params.id)))));

// Sustituye los vencimientos de una factura. Los recibos con cobros se conservan tal cual.
router.put('/documentos/:id/recibos', envolver((req, res) => {
  const id = Number(req.params.id);
  transaccion(() => {
    const d = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
    if (!d || d.tipo !== 'factura' || d.numero == null) throw error('Solo las facturas emitidas tienen vencimientos', 404);
    const actuales = recibosDe(id);
    const conCobros = actuales.filter((r) => r.cobros.length);
    const nuevos = (Array.isArray(req.body.recibos) ? req.body.recibos : []).map((r) => {
      if (!fechaValida(r.vencimiento)) throw error('Fecha de vencimiento no válida');
      const importe = r2(Number(r.importe));
      if (!Number.isFinite(importe) || importe === 0) throw error('Cada vencimiento necesita un importe');
      return { importe, vencimiento: r.vencimiento, forma_pago: r.forma_pago || d.forma_pago, notas: String(r.notas || '').slice(0, 300) };
    });
    const suma = r2(conCobros.reduce((s, r) => s + r.importe, 0) + nuevos.reduce((s, r) => s + r.importe, 0));
    if (Math.abs(suma - r2(d.total)) > 0.005) throw error(`Los vencimientos deben sumar el total de la factura (${r2(d.total)}); ahora suman ${suma}`);
    db.prepare(`DELETE FROM recibos WHERE documento_id = ? AND id NOT IN (SELECT DISTINCT recibo_id FROM cobros)`).run(id);
    let n = conCobros.reduce((m, r) => Math.max(m, r.numero), 0);
    const ins = db.prepare('INSERT INTO recibos(documento_id, numero, importe, vencimiento, forma_pago, notas) VALUES (?,?,?,?,?,?)');
    for (const r of nuevos.sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))) ins.run(id, ++n, r.importe, r.vencimiento, r.forma_pago, r.notas);
    const ultimo = db.prepare('SELECT MAX(vencimiento) v FROM recibos WHERE documento_id = ?').get(id).v;
    db.prepare('UPDATE documentos SET vencimiento = ? WHERE id = ?').run(ultimo, id);
    actualizarEstadoCobro(id);
  });
  auditar(req, 'recibos.editar', `documento=${id}`);
  res.json(recibosDe(id));
}));

// ---- Cobros ----
/** Registra un cobro (o pago) en un recibo con las comprobaciones normales. Devuelve { id, documento_id }. Lo usan también los plugins. */
export function registrarCobro(reciboId, body, usuarioId) {
  const r = db.prepare('SELECT * FROM recibos WHERE id = ?').get(Number(reciboId));
  if (!r) throw error('Recibo no encontrado', 404);
  const [rec] = recibosDe(r.documento_id).filter((x) => x.id === r.id);
  const fecha = fechaValida(body.fecha) ? body.fecha : hoy();
  const importe = r2(body.importe ?? rec.pendiente);
  if (!Number.isFinite(importe) || importe === 0) throw error('Importe no válido');
  if (Math.sign(importe) !== Math.sign(rec.importe)) throw error('El importe debe tener el mismo signo que el recibo');
  if (Math.abs(importe) - Math.abs(rec.pendiente) > 0.005) throw error(`El cobro supera lo pendiente del recibo (${rec.pendiente})`);
  if (!ajustesCobros().cobros_parciales && Math.abs(importe - rec.pendiente) > 0.005) throw error('Los cobros parciales están desactivados en Ajustes → Cobros');
  const fp = body.forma_pago && db.prepare('SELECT 1 FROM formas_pago WHERE codigo = ?').get(body.forma_pago) ? body.forma_pago : r.forma_pago;
  const id = Number(db.prepare('INSERT INTO cobros(recibo_id, fecha, importe, forma_pago, notas, usuario_id) VALUES (?,?,?,?,?,?)')
    .run(r.id, fecha, importe, fp, String(body.notas || '').slice(0, 300), usuarioId ?? null).lastInsertRowid);
  actualizarEstadoCobro(r.documento_id);
  return { id, documento_id: r.documento_id, importe };
}
/** Anula un cobro. Devuelve el cobro borrado (con documento_id). */
export function borrarCobro(cobroId) {
  const c = db.prepare('SELECT c.*, r.documento_id FROM cobros c JOIN recibos r ON r.id = c.recibo_id WHERE c.id = ?').get(Number(cobroId));
  if (!c) throw error('Cobro no encontrado', 404);
  db.prepare('DELETE FROM cobros WHERE id = ?').run(c.id);
  actualizarEstadoCobro(c.documento_id);
  return c;
}
router.post('/recibos/:id/cobros', envolver((req, res) => {
  const c = registrarCobro(req.params.id, req.body, req.usuario.id);
  auditar(req, 'cobro.registrar', `recibo=${req.params.id} ${c.importe}`);
  res.status(201).json(recibosDe(c.documento_id));
}));

router.delete('/cobros/:id', envolver((req, res) => {
  const c = borrarCobro(req.params.id);
  auditar(req, 'cobro.anular', `cobro=${c.id} ${c.importe}`, 'aviso');
  res.json(recibosDe(c.documento_id));
}));

// ---- Avisos (campana e inicio) ----
router.get('/avisos', envolver(async (_req, res) => {
  // Avisos de los plugins (p. ej. borradores de facturas periódicas por revisar): [{ titulo, detalle, enlace }]
  const plugins = [];
  const { extensionesDe } = await import('../plugins.mjs');
  for (const { id, fn } of extensionesDe('avisos')) {
    try { for (const a of (await fn()) || []) if (a?.titulo) plugins.push({ plugin: id, titulo: String(a.titulo).slice(0, 120), detalle: String(a.detalle || '').slice(0, 200), enlace: String(a.enlace || '').startsWith('/') ? a.enlace : '' }); }
    catch (e) { console.error(`[${id}] avisos:`, e.message); }
  }
  const o = ajustesCobros();
  if (!o.avisos) return res.json({ activos: plugins.length > 0, proximos: [], impagados: [], pagos: [], plugins });
  const h = hoy();
  const pendienteSql = 'ROUND(r.importe - COALESCE((SELECT SUM(importe) FROM cobros WHERE recibo_id = r.id), 0), 2)';
  const base = `SELECT r.id, r.numero, r.vencimiento, d.id AS documento_id, d.codigo, json_extract(d.cliente, '$.nombre') AS cliente_nombre,
      ${pendienteSql} AS pendiente
    FROM recibos r JOIN documentos d ON d.id = r.documento_id
    WHERE ABS(${pendienteSql}) >= 0.005`;
  const ventas = `${base} AND d.tipo = 'factura'`;
  const proximos = o.aviso_dias_antes > 0
    ? db.prepare(`${ventas} AND r.vencimiento >= ? AND r.vencimiento <= ? ORDER BY r.vencimiento`).all(h, sumarDias(h, o.aviso_dias_antes))
    : [];
  const impagados = db.prepare(`${ventas} AND r.vencimiento <= ? ORDER BY r.vencimiento`).all(sumarDias(h, -Math.max(1, o.aviso_impagado_dias)));
  // Pagos a proveedores que vencen pronto o ya han vencido
  const pagos = db.prepare(`${base} AND d.tipo IN ('factura_compra', 'gasto') AND r.vencimiento <= ? ORDER BY r.vencimiento`)
    .all(sumarDias(h, Math.max(0, o.aviso_dias_antes)));
  res.json({ activos: true, en_inicio: o.avisos_en_inicio, proximos, impagados, pagos, plugins });
}));
