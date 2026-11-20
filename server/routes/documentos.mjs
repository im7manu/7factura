// Documentos de venta y compra: facturas, presupuestos, proformas, pedidos, albaranes, facturas recibidas y gastos.
import { Router } from 'express';
import crypto from 'node:crypto';
import { db, getAjuste, setAjuste, transaccion, auditar } from '../db.mjs';
import { calcularTotales, r2, OPERACIONES, componerCodigo } from '../lib/totales.mjs';
import { generarPdf } from '../lib/pdf.mjs';
import { validarNif } from '../lib/nif.mjs';
import { hooks, extensionesDe } from '../plugins.mjs';
import { generarRecibos, recibosDe, cobrarTodo, anularCobros, ajustesCobros } from './cobros.mjs';
import { guardarAdjunto, rutaAdjunto } from './adjuntos.mjs';
import { requiereAdmin } from '../auth.mjs';

export const router = Router();

/**
 * Tipos de documento. Las facturas de venta usan las series configurables; el resto usa una serie interna fija.
 * estadoEmitido: estado al emitir. facturable: estados desde los que se puede facturar. compra: el tercero es un proveedor.
 */
export const TIPOS = {
  factura: { serie: null, estadoEmitido: 'emitida', estados: ['borrador', 'emitida', 'pagada'], formato: null },
  presupuesto: { serie: 'PRE', estadoEmitido: 'emitido', estados: ['borrador', 'emitido', 'aceptado', 'rechazado', 'facturado'], formato: 'P{num}/{año}', facturable: ['emitido', 'aceptado'], estadoFacturado: 'facturado' },
  proforma: { serie: 'PF', estadoEmitido: 'emitida', estados: ['borrador', 'emitida', 'anulada', 'facturada'], formato: 'PF{num}/{año}', facturable: ['emitida'], estadoFacturado: 'facturada' },
  pedido: { serie: 'PED', estadoEmitido: 'emitido', estados: ['borrador', 'emitido', 'servido', 'cancelado', 'facturado'], formato: 'PED{num}/{año}', facturable: ['emitido', 'servido'], estadoFacturado: 'facturado' },
  albaran: { serie: 'ALB', estadoEmitido: 'emitido', estados: ['borrador', 'emitido', 'firmado', 'facturado'], formato: 'ALB{num}/{año}', facturable: ['emitido', 'firmado'], estadoFacturado: 'facturado' },
  // ---- Compras (el tercero es un proveedor) ----
  presupuesto_compra: { compra: true, serie: 'PRC', estadoEmitido: 'emitido', estados: ['borrador', 'emitido', 'aceptado', 'rechazado', 'facturado'], formato: 'PRC{num}/{año}', facturable: ['emitido', 'aceptado'], estadoFacturado: 'facturado' },
  pedido_compra: { compra: true, serie: 'PEC', estadoEmitido: 'emitido', estados: ['borrador', 'emitido', 'recibido', 'cancelado', 'facturado'], formato: 'PEC{num}/{año}', facturable: ['emitido', 'recibido'], estadoFacturado: 'facturado' },
  albaran_compra: { compra: true, serie: 'ALC', estadoEmitido: 'emitido', estados: ['borrador', 'emitido', 'facturado'], formato: 'ALC{num}/{año}', facturable: ['emitido'], estadoFacturado: 'facturado' },
  factura_compra: { compra: true, serie: 'FC', estadoEmitido: 'emitida', estados: ['borrador', 'emitida', 'pagada'], formato: 'FC{num}/{año}' },
  gasto: { compra: true, serie: 'G', estadoEmitido: 'emitida', estados: ['borrador', 'emitida', 'pagada'], formato: 'G{num}/{año}' },
};
/** Tipos con vencimientos y cobros/pagos. */
export const CON_RECIBOS = ['factura', 'factura_compra', 'gasto'];
const esCompra = (tipo) => !!TIPOS[tipo]?.compra;

/** A qué tipos se puede convertir cada documento (siempre como borrador nuevo). */
export const CONVERSIONES = {
  presupuesto: ['pedido', 'albaran', 'proforma', 'factura'],
  proforma: ['factura'],
  pedido: ['albaran', 'factura'],
  albaran: ['factura'],
  presupuesto_compra: ['pedido_compra', 'albaran_compra', 'factura_compra'],
  pedido_compra: ['albaran_compra', 'factura_compra'],
  albaran_compra: ['factura_compra'],
};
/** Factura que corresponde a cada circuito. */
const facturaDe = (tipo) => (esCompra(tipo) ? 'factura_compra' : 'factura');

/** Opciones del circuito de venta (Ajustes → Ventas). */
export const VENTAS_DEFECTO = {
  pedidos: true,                   // mostrar «Pedidos» en el menú
  albaranes: true,                 // mostrar «Albaranes» en el menú
  albaran_valorado: true,          // los albaranes nuevos salen con precios
  indicar_albaran_en_factura: true, // al facturar albaranes, cada línea indica su albarán
  facturar_mes_emitir: false,      // «Facturar el mes» emite las facturas en vez de dejarlas en borrador
};
export const ajustesVentas = () => ({ ...VENTAS_DEFECTO, ...getAjuste('ventas', {}) });

/** Opciones de compras (Ajustes → Compras). */
export const COMPRAS_DEFECTO = {
  presupuestos_compra: false,  // pedir presupuestos a proveedores
  pedidos_compra: true,        // hacer pedidos a proveedores
  albaranes_compra: true,      // registrar albaranes de proveedor
  gastos: true,                // tickets y gastos sin factura completa
  gasto_pagado: true,          // un gasto se da por pagado al registrarlo
  gasto_deducible: true,       // los gastos nuevos cuentan el IVA como deducible
  vehiculos: true,             // asignar gastos a vehículos
  menu_pagos: true,            // listado de pagos a proveedores en el menú
};
export const ajustesCompras = () => ({ ...COMPRAS_DEFECTO, ...getAjuste('compras', {}) });

const TRANSICIONES = {
  factura: { emitida: ['pagada'], pagada: ['emitida'] },
  presupuesto: { emitido: ['aceptado', 'rechazado'], aceptado: ['emitido', 'rechazado'], rechazado: ['emitido', 'aceptado'] },
  proforma: { emitida: ['anulada'], anulada: ['emitida'] },
  pedido: { emitido: ['cancelado'], cancelado: ['emitido'] },
  albaran: {},
  presupuesto_compra: { emitido: ['aceptado', 'rechazado'], aceptado: ['emitido', 'rechazado'], rechazado: ['emitido', 'aceptado'] },
  pedido_compra: { emitido: ['cancelado', 'recibido'], cancelado: ['emitido'], recibido: ['emitido'] },
  albaran_compra: {},
  factura_compra: { emitida: ['pagada'], pagada: ['emitida'] },
  gasto: { emitida: ['pagada'], pagada: ['emitida'] },
};

// Fecha local del servidor (configura TZ=Europe/Madrid en producción)
export const hoy = () => new Date().toLocaleDateString('sv-SE');

class ErrorUsuario extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

const tipoValido = (t) => (Object.hasOwn(TIPOS, t) ? t : null);

function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
}

function fechaValida(f) {
  return typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f));
}

/** Plantilla de numeración: la de la serie para facturas de venta; la de Ajustes (o la predeterminada) para el resto. */
function formatoNumeracion(tipo, serie) {
  if (tipo === 'factura') return db.prepare('SELECT formato FROM series WHERE codigo = ?').get(serie)?.formato || '{num}/{año}';
  return getAjuste('formatos', {})[tipo] || TIPOS[tipo].formato;
}

/** Copia de los datos del cliente o proveedor que se guarda en el documento. */
function snapshotCliente(terceroId, tabla = 'clientes') {
  if (!terceroId) return {};
  const t = tabla === 'proveedores' ? 'proveedores' : 'clientes';
  const c = db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(terceroId);
  if (!c) throw new ErrorUsuario(t === 'proveedores' ? 'El proveedor no existe' : 'El cliente no existe');
  const { id, nombre, nif, direccion, cp, ciudad, provincia, pais, email } = c;
  return { id, nombre, nif, direccion, cp, ciudad, provincia, pais, email };
}
const snapshotDe = (d) => (esCompra(d.tipo) ? snapshotCliente(d.proveedor_id, 'proveedores') : snapshotCliente(d.cliente_id));

function limpiarLineas(lineas) {
  if (!Array.isArray(lineas)) throw new ErrorUsuario('Faltan las líneas');
  if (lineas.length > 500) throw new ErrorUsuario('Demasiadas líneas (máximo 500)');
  return lineas.map((l, i) => {
    const n = (v, def = 0) => {
      const x = Number(v ?? def);
      if (!Number.isFinite(x)) throw new ErrorUsuario(`Línea ${i + 1}: valor numérico no válido`);
      return x;
    };
    const operacion = String(l.operacion || 'S1');
    if (!Object.hasOwn(OPERACIONES, operacion)) throw new ErrorUsuario(`Línea ${i + 1}: calificación de IVA no válida`);
    const conIva = OPERACIONES[operacion].conIva && !l.suplido;
    const linea = {
      orden: i,
      producto_id: l.producto_id ? Number(l.producto_id) : null,
      descripcion: String(l.descripcion ?? '').slice(0, 2000),
      cantidad: n(l.cantidad, 1),
      precio: n(l.precio),
      dto: n(l.dto),
      // Si la operación no lleva IVA, el tipo y el recargo se guardan a 0
      iva: conIva ? n(l.iva, 21) : 0,
      recargo: conIva ? n(l.recargo) : 0,
      irpf: l.suplido ? 0 : n(l.irpf),
      operacion,
      suplido: l.suplido ? 1 : 0,
      vehiculo_id: l.vehiculo_id ? Number(l.vehiculo_id) : null,
    };
    if (linea.vehiculo_id && !db.prepare('SELECT 1 FROM vehiculos WHERE id = ?').get(linea.vehiculo_id)) throw new ErrorUsuario(`Línea ${i + 1}: el vehículo no existe`);
    for (const [k, v] of [['descuento', linea.dto], ['IVA', linea.iva], ['recargo', linea.recargo], ['IRPF', linea.irpf]]) {
      if (v < 0 || v > 100) throw new ErrorUsuario(`Línea ${i + 1}: ${k} fuera de rango (0-100)`);
    }
    return linea;
  });
}

export function cargarDocumento(id) {
  const d = db.prepare(`SELECT d.*, s.tipo AS serie_tipo FROM documentos d
    LEFT JOIN series s ON s.codigo = d.serie AND d.tipo = 'factura' WHERE d.id = ?`).get(id);
  if (!d) return null;
  d.cliente = JSON.parse(d.cliente || '{}');
  d.lineas = db.prepare('SELECT * FROM lineas WHERE documento_id = ? ORDER BY orden, id').all(id)
    .map((l) => ({ ...l, suplido: !!l.suplido }));
  d.totales = calcularTotales(d.lineas);
  if (d.rectifica_id) d.rectificada = db.prepare('SELECT id, codigo, fecha FROM documentos WHERE id = ?').get(d.rectifica_id);
  d.rectificativas = db.prepare('SELECT id, codigo, estado, total FROM documentos WHERE rectifica_id = ?').all(id);
  d.origenes = db.prepare(`SELECT o.id, o.codigo, o.tipo, o.fecha FROM documentos_origen x JOIN documentos o ON o.id = x.origen_id
    WHERE x.documento_id = ? ORDER BY o.fecha, o.id`).all(id);
  d.origen = d.origenes[0];
  d.derivados = db.prepare(`SELECT o.id, o.codigo, o.tipo, o.estado FROM documentos_origen x JOIN documentos o ON o.id = x.documento_id
    WHERE x.origen_id = ? ORDER BY o.id`).all(id);
  d.num_adjuntos = db.prepare("SELECT COUNT(*) n FROM adjuntos WHERE entidad = 'documento' AND entidad_id = ?").get(id).n;
  d.recibos = CON_RECIBOS.includes(d.tipo) && d.numero != null ? recibosDe(id) : [];
  d.valorado = !!d.valorado;
  d.deducible = !!d.deducible;
  return d;
}

function guardarLineasYTotales(docId, lineas) {
  db.prepare('DELETE FROM lineas WHERE documento_id = ?').run(docId);
  const ins = db.prepare(`INSERT INTO lineas(documento_id, orden, producto_id, descripcion, cantidad, precio, dto, iva, irpf, recargo, operacion, suplido, vehiculo_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const l of lineas) {
    ins.run(docId, l.orden, l.producto_id, l.descripcion, l.cantidad, l.precio, l.dto, l.iva, l.irpf, l.recargo || 0, l.operacion || 'S1', l.suplido ? 1 : 0, l.vehiculo_id ?? null);
  }
  const t = calcularTotales(lineas);
  db.prepare(`UPDATE documentos SET neto = ?, total_iva = ?, total_recargo = ?, total_irpf = ?, total_suplidos = ?, total = ?,
    actualizado = datetime('now') WHERE id = ?`).run(t.neto, t.totalIva, t.totalRecargo, t.totalIrpf, t.totalSuplidos, t.total, docId);
}

function datosCabecera(body, tipo, actual = {}) {
  const fecha = body.fecha ?? actual.fecha ?? hoy();
  if (!fechaValida(fecha)) throw new ErrorUsuario('Fecha no válida');
  const serie = TIPOS[tipo].serie ?? (body.serie ?? actual.serie ?? getAjuste('serie_defecto', 'A'));
  if (tipo === 'factura' && !db.prepare('SELECT 1 FROM series WHERE codigo = ?').get(serie)) throw new ErrorUsuario('La serie no existe');
  const formaPago = body.forma_pago !== undefined ? (body.forma_pago || null) : (actual.forma_pago ?? null);
  if (formaPago && !db.prepare('SELECT 1 FROM formas_pago WHERE codigo = ?').get(formaPago)) throw new ErrorUsuario('La forma de pago no existe');
  const vencimiento = body.vencimiento !== undefined ? (body.vencimiento || null) : (actual.vencimiento ?? null);
  if (vencimiento && !fechaValida(vencimiento)) throw new ErrorUsuario('Vencimiento no válido');
  const compra = esCompra(tipo);
  const campo = compra ? 'proveedor_id' : 'cliente_id';
  const terceroId = body[campo] !== undefined ? (body[campo] ? Number(body[campo]) : null) : (actual[campo] ?? null);
  return {
    fecha, serie, ejercicio: Number(fecha.slice(0, 4)), forma_pago: formaPago, vencimiento,
    cliente_id: compra ? null : terceroId, proveedor_id: compra ? terceroId : null,
    cliente: JSON.stringify(snapshotCliente(terceroId, compra ? 'proveedores' : 'clientes')),
    numero_proveedor: String(body.numero_proveedor ?? actual.numero_proveedor ?? '').trim().slice(0, 60),
    deducible: body.deducible !== undefined ? (body.deducible ? 1 : 0)
      : actual.deducible !== undefined ? actual.deducible
      : (tipo === 'gasto' ? (ajustesCompras().gasto_deducible ? 1 : 0) : 1),
    referencia: String(body.referencia ?? actual.referencia ?? '').slice(0, 100),
    observaciones: String(body.observaciones ?? actual.observaciones ?? '').slice(0, 4000),
    motivo: String(body.motivo ?? actual.motivo ?? '').slice(0, 1000),
    valorado: body.valorado !== undefined ? (body.valorado ? 1 : 0)
      : actual.valorado !== undefined ? actual.valorado
      : (tipo === 'albaran' ? (ajustesVentas().albaran_valorado ? 1 : 0) : 1),
  };
}

function crearBorrador({ tipo, cab, lineas, usuarioId, rectifica_id = null, origen_id = null, origenes = null }) {
  const ids = origenes || (origen_id ? [origen_id] : []);
  const r = db.prepare(`INSERT INTO documentos(tipo, serie, ejercicio, fecha, vencimiento, cliente_id, proveedor_id, cliente, forma_pago, referencia,
      numero_proveedor, deducible, observaciones, motivo, rectifica_id, origen_id, valorado, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(tipo, cab.serie, cab.ejercicio, cab.fecha, cab.vencimiento, cab.cliente_id, cab.proveedor_id ?? null,
    cab.cliente, cab.forma_pago, cab.referencia, cab.numero_proveedor ?? '', cab.deducible ?? 1, cab.observaciones, cab.motivo, rectifica_id, ids[0] ?? null, cab.valorado ?? 1, usuarioId);
  const id = Number(r.lastInsertRowid);
  const insO = db.prepare('INSERT OR IGNORE INTO documentos_origen(documento_id, origen_id) VALUES (?,?)');
  for (const o of ids) insO.run(id, o);
  guardarLineasYTotales(id, lineas);
  return id;
}

/** ¿Este documento ya tiene un documento derivado del tipo indicado (borrador o emitido)? */
function tieneDerivado(id, tipo) {
  return !!db.prepare(`SELECT 1 FROM documentos_origen x JOIN documentos d ON d.id = x.documento_id
    WHERE x.origen_id = ? AND d.tipo = ? LIMIT 1`).get(id, tipo);
}

/** Estado que toma un documento de origen cuando se emite uno derivado. */
function estadoOrigenTrasEmitir(tipoOrigen, tipoNuevo) {
  if (tipoNuevo === 'factura' || tipoNuevo === 'factura_compra') return TIPOS[tipoOrigen]?.estadoFacturado || null;
  if (tipoOrigen === 'pedido' && tipoNuevo === 'albaran') return 'servido';
  if (tipoOrigen === 'pedido_compra' && tipoNuevo === 'albaran_compra') return 'recibido';
  if (tipoOrigen === 'presupuesto' || tipoOrigen === 'presupuesto_compra') return 'aceptado';
  return null;
}

const envolver = (fn) => (req, res) => {
  try {
    fn(req, res);
  } catch (e) {
    if (e instanceof ErrorUsuario || e.status) return res.status(e.status || 400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
};

// ---- Listado ----
router.get('/', envolver((req, res) => {
  const tipo = tipoValido(req.query.tipo) || 'factura';
  const where = ['d.tipo = ?'];
  const params = [tipo];
  if (req.query.estado) { where.push('d.estado = ?'); params.push(String(req.query.estado)); }
  if (req.query.ejercicio) { where.push('d.ejercicio = ?'); params.push(Number(req.query.ejercicio)); }
  if (req.query.cliente_id) { where.push('d.cliente_id = ?'); params.push(Number(req.query.cliente_id)); }
  if (req.query.proveedor_id) { where.push('d.proveedor_id = ?'); params.push(Number(req.query.proveedor_id)); }
  if (req.query.pendientes === '1') where.push("d.estado = 'emitida'");
  if (req.query.q) {
    where.push("(d.codigo LIKE ? OR d.referencia LIKE ? OR d.numero_proveedor LIKE ? OR json_extract(d.cliente, '$.nombre') LIKE ? OR json_extract(d.cliente, '$.nif') LIKE ?)");
    const q = `%${String(req.query.q)}%`;
    params.push(q, q, q, q, q);
  }
  const filas = db.prepare(`SELECT d.id, d.tipo, d.serie, d.codigo, d.fecha, d.vencimiento, d.estado, d.referencia, d.numero_proveedor, d.cobrado,
      d.firma_nombre, d.neto, d.total_iva, d.total_irpf, d.total, d.rectifica_id,
      json_extract(d.cliente, '$.nombre') AS cliente_nombre, json_extract(d.cliente, '$.nif') AS cliente_nif
    FROM documentos d WHERE ${where.join(' AND ')}
    ORDER BY (d.numero IS NULL) DESC, d.fecha DESC, d.numero DESC, d.id DESC LIMIT 500`).all(...params);
  res.json(filas);
}));

// ---- Crear borrador ----
/** Crea un borrador con las mismas validaciones que la API (lo usan también los plugins). Devuelve su id. */
export function crearDocumentoBorrador(body, usuarioId) {
  const tipo = tipoValido(body.tipo);
  if (!tipo) throw new ErrorUsuario('Tipo de documento no válido');
  return transaccion(() => crearBorrador({ tipo, cab: datosCabecera(body, tipo), lineas: limpiarLineas(body.lineas || []), usuarioId }));
}
router.post('/', envolver((req, res) => {
  const id = crearDocumentoBorrador(req.body, req.usuario.id);
  auditar(req, `${req.body.tipo}.crear`, `id=${id}`);
  res.status(201).json(cargarDocumento(id));
}));

// ---- Emitir: asigna número correlativo y congela el documento ----
/** Emite un borrador: asigna número, genera recibos y congela el documento. Lanza ErrorUsuario si no se puede. */
function emitirDocumento(id, req) {
  // Los plugins pueden impedir la emisión con un motivo (p. ej. «sin existencias» en el control de stock)
  const previo = cargarDocumento(id);
  if (previo && previo.estado === 'borrador') {
    for (const { id: plugin, fn } of extensionesDe('documento.validarEmision')) {
      let motivo = null;
      try { motivo = fn(previo); } catch (e) { console.error(`[${plugin}] documento.validarEmision:`, e.message); }
      if (motivo) throw new ErrorUsuario(String(motivo), 409);
    }
  }
  transaccion(() => {
    const d = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
    if (!d) throw new ErrorUsuario('No encontrado', 404);
    if (d.estado !== 'borrador') throw new ErrorUsuario('El documento ya está emitido', 409);
    const lineas = db.prepare('SELECT * FROM lineas WHERE documento_id = ?').all(id);
    if (!lineas.length) throw new ErrorUsuario('Añade al menos una línea');
    if (lineas.some((l) => !l.descripcion.trim())) throw new ErrorUsuario('Todas las líneas necesitan descripción');
    const empresa = getAjuste('empresa', {});
    if (!empresa.razon_social || !empresa.nif) throw new ErrorUsuario('Completa los datos de tu empresa (razón social y NIF) en Ajustes antes de emitir');
    const compra = esCompra(d.tipo);
    if (compra ? (!d.proveedor_id && d.tipo !== 'gasto') : !d.cliente_id) throw new ErrorUsuario(compra ? 'Selecciona un proveedor' : 'Selecciona un cliente');

    const tercero = snapshotDe(d);
    const serieInfo = d.tipo === 'factura' ? db.prepare('SELECT tipo FROM series WHERE codigo = ?').get(d.serie) : null;
    if (d.tipo === 'factura' && serieInfo?.tipo !== 'simplificada') {
      if (!tercero.nif) throw new ErrorUsuario('Una factura completa necesita el NIF del cliente');
      if ((tercero.pais || 'ES') === 'ES' && !validarNif(tercero.nif).valido) throw new ErrorUsuario(`El NIF del cliente (${tercero.nif}) no es válido`);
    }
    if (d.tipo === 'factura' && d.rectifica_id && serieInfo?.tipo !== 'rectificativa') throw new ErrorUsuario('Las rectificativas deben usar una serie de tipo rectificativa');
    if (d.rectifica_id && !d.motivo.trim()) throw new ErrorUsuario('Indica el motivo de la rectificación');
    if (d.tipo === 'factura_compra') {
      if (!d.numero_proveedor) throw new ErrorUsuario('Indica el número de la factura del proveedor');
      if (!tercero.nif) throw new ErrorUsuario('El proveedor necesita NIF para registrar su factura');
      const dup = db.prepare(`SELECT codigo FROM documentos WHERE tipo = 'factura_compra' AND proveedor_id = ? AND numero_proveedor = ? AND ejercicio = ? AND id <> ? AND numero IS NOT NULL`)
        .get(d.proveedor_id, d.numero_proveedor, d.ejercicio, id);
      if (dup) throw new ErrorUsuario(`Esa factura del proveedor ya está registrada (${dup.codigo})`, 409);
    }

    // Numeración correlativa. En ventas, la fecha no puede ser anterior a la del último documento de la serie;
    // en compras el número es un registro interno y las facturas pueden llegar desordenadas.
    const ultima = db.prepare(`SELECT numero, fecha, codigo FROM documentos WHERE tipo = ? AND serie = ? AND ejercicio = ? AND numero IS NOT NULL
      ORDER BY numero DESC LIMIT 1`).get(d.tipo, d.serie, d.ejercicio);
    if (!compra && ultima && d.fecha < ultima.fecha) {
      throw new ErrorUsuario(`La fecha (${d.fecha}) es anterior a la del último documento ${ultima.codigo} (${ultima.fecha}). La numeración debe ser correlativa en el tiempo.`, 409);
    }
    const numero = (ultima?.numero || 0) + 1;
    const codigo = componerCodigo(formatoNumeracion(d.tipo, d.serie), { numero, ejercicio: d.ejercicio, serie: d.serie });
    if (db.prepare('SELECT 1 FROM documentos WHERE tipo = ? AND codigo = ? AND ejercicio = ?').get(d.tipo, codigo, d.ejercicio)) {
      throw new ErrorUsuario(`Ya existe un documento con el número ${codigo}. Revisa el formato de numeración.`, 409);
    }
    let vencimiento = d.vencimiento;
    if (!vencimiento && !['presupuesto', 'presupuesto_compra'].includes(d.tipo) && d.forma_pago) {
      const fp = db.prepare('SELECT dias FROM formas_pago WHERE codigo = ?').get(d.forma_pago);
      vencimiento = sumarDias(d.fecha, fp?.dias || 0);
    }
    const emitidaEn = new Date().toISOString();

    // Cadena de huellas (integridad): cada factura de venta emitida enlaza con la anterior.
    let huella = null;
    let huellaAnterior = null;
    if (d.tipo === 'factura') {
      huellaAnterior = db.prepare(`SELECT huella FROM documentos WHERE tipo = 'factura' AND huella IS NOT NULL
        ORDER BY emitida_en DESC, id DESC LIMIT 1`).get()?.huella || '';
      const t = calcularTotales(lineas);
      huella = crypto.createHash('sha256').update([
        empresa.nif, codigo, d.fecha, d.rectifica_id ? 'R' : serieInfo?.tipo === 'simplificada' ? 'F2' : 'F1',
        r2(t.totalIva + t.totalRecargo).toFixed(2), r2(t.total).toFixed(2), huellaAnterior, emitidaEn,
      ].join('|')).digest('hex').toUpperCase();
    }
    db.prepare(`UPDATE documentos SET numero=?, codigo=?, estado=?, cliente=?, vencimiento=?, huella=?, huella_anterior=?,
      emitida_en=?, actualizado=datetime('now') WHERE id = ?`)
      .run(numero, codigo, TIPOS[d.tipo].estadoEmitido, JSON.stringify(tercero), vencimiento, huella, huellaAnterior, emitidaEn, id);
    if (CON_RECIBOS.includes(d.tipo)) {
      generarRecibos(id);
      // Un gasto (ticket) se da por pagado al registrarlo si así está configurado
      if (d.tipo === 'gasto' && ajustesCompras().gasto_pagado) cobrarTodo(id, d.fecha, req.usuario?.id ?? null);
    }
    for (const o of db.prepare('SELECT d.id, d.tipo FROM documentos_origen x JOIN documentos d ON d.id = x.origen_id WHERE x.documento_id = ?').all(id)) {
      const nuevoEstado = estadoOrigenTrasEmitir(o.tipo, d.tipo);
      if (nuevoEstado) db.prepare("UPDATE documentos SET estado = ?, actualizado = datetime('now') WHERE id = ? AND estado <> 'facturado' AND estado <> 'facturada'").run(nuevoEstado, o.id);
    }
  });
  const doc = cargarDocumento(id);
  auditar(req, `${doc.tipo}.emitir`, doc.codigo);
  hooks.emit('documento.emitido', doc);
  return doc;
}

router.post('/:id/emitir', envolver((req, res) => res.json(emitirDocumento(Number(req.params.id), req))));

// ---- Cambio de estado (cobro/pago, aceptación, anulación…) ----
router.post('/:id/estado', envolver((req, res) => {
  const id = Number(req.params.id);
  const d = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
  if (!d) throw new ErrorUsuario('No encontrado', 404);
  const nuevo = String(req.body.estado || '');
  if (!TRANSICIONES[d.tipo]?.[d.estado]?.includes(nuevo)) throw new ErrorUsuario(`No se puede pasar de «${d.estado}» a «${nuevo}»`, 409);
  if (CON_RECIBOS.includes(d.tipo)) {
    // En facturas y gastos, el estado se deriva de los cobros/pagos: pagar todo lo pendiente o anularlos
    transaccion(() => (nuevo === 'pagada' ? cobrarTodo(id, fechaValida(req.body.fecha) ? req.body.fecha : hoy(), req.usuario.id) : anularCobros(id)));
  } else {
    db.prepare("UPDATE documentos SET estado = ?, actualizado = datetime('now') WHERE id = ?").run(nuevo, id);
  }
  auditar(req, `${d.tipo}.estado`, `${d.codigo}: ${d.estado} → ${nuevo}`);
  const doc = cargarDocumento(id);
  hooks.emit('documento.estado', { doc, antes: d.estado, nuevo });
  res.json(doc);
}));

// ---- Rectificativa: nuevo documento con las líneas en negativo ----
router.post('/:id/rectificar', envolver((req, res) => {
  const id = Number(req.params.id);
  const nuevo = transaccion(() => {
    const d = cargarDocumento(id);
    if (!d || !['factura', 'factura_compra'].includes(d.tipo)) throw new ErrorUsuario('No encontrado', 404);
    if (d.estado === 'borrador') throw new ErrorUsuario('Un borrador se corrige editándolo, no con una rectificativa', 409);
    if (d.rectifica_id) throw new ErrorUsuario('No se puede rectificar una rectificativa; rectifica la factura original', 409);
    let serie;
    if (d.tipo === 'factura') {
      serie = db.prepare("SELECT codigo FROM series WHERE tipo = 'rectificativa' ORDER BY codigo LIMIT 1").get()?.codigo;
      if (!serie) throw new ErrorUsuario('Crea una serie de tipo rectificativa en Ajustes');
    }
    const cab = datosCabecera({ serie, fecha: hoy(), cliente_id: d.cliente_id, proveedor_id: d.proveedor_id, forma_pago: d.forma_pago,
      vencimiento: null, referencia: d.referencia, numero_proveedor: '', observaciones: '', motivo: String(req.body.motivo || '') }, d.tipo);
    const lineas = d.lineas.map((l, i) => ({ ...l, orden: i, cantidad: -l.cantidad }));
    return crearBorrador({ tipo: d.tipo, cab, lineas, usuarioId: req.usuario.id, rectifica_id: id });
  });
  auditar(req, 'factura.rectificar', `origen=${id} nueva=${nuevo}`);
  res.status(201).json(cargarDocumento(nuevo));
}));

// ---- Duplicar (como borrador con fecha de hoy) ----
router.post('/:id/duplicar', envolver((req, res) => {
  const id = Number(req.params.id);
  const nuevo = transaccion(() => {
    const d = cargarDocumento(id);
    if (!d) throw new ErrorUsuario('No encontrado', 404);
    const serie = d.tipo === 'factura' && d.rectifica_id ? getAjuste('serie_defecto', 'A') : d.serie;
    const cab = datosCabecera({ serie, fecha: hoy(), cliente_id: d.cliente_id, proveedor_id: d.proveedor_id, forma_pago: d.forma_pago,
      vencimiento: null, referencia: '', numero_proveedor: '', observaciones: d.observaciones, motivo: '', valorado: d.valorado, deducible: d.deducible }, d.tipo);
    const lineas = d.lineas.map((l, i) => ({ ...l, orden: i, cantidad: d.rectifica_id ? Math.abs(l.cantidad) : l.cantidad }));
    return crearBorrador({ tipo: d.tipo, cab, lineas, usuarioId: req.usuario.id });
  });
  res.status(201).json(cargarDocumento(nuevo));
}));

// ---- Convertir un documento en otro (presupuesto → pedido → albarán → factura…) ----
function convertir(id, destino, usuarioId) {
  const d = cargarDocumento(id);
  if (!d) throw new ErrorUsuario('No encontrado', 404);
  if (!CONVERSIONES[d.tipo]?.includes(destino)) throw new ErrorUsuario(`Un ${d.tipo} no se puede convertir en ${destino}`);
  if (d.estado === 'borrador') throw new ErrorUsuario('Emite el documento antes de convertirlo', 409);
  if (['cancelado', 'anulada', 'rechazado'].includes(d.estado)) throw new ErrorUsuario('El documento está cancelado', 409);
  const factura = facturaDe(d.tipo);
  if (destino === factura && (['facturado', 'facturada'].includes(d.estado) || tieneDerivado(id, factura))) throw new ErrorUsuario('Este documento ya está facturado', 409);
  const tabla = esCompra(d.tipo) ? 'proveedores' : 'clientes';
  const terceroId = esCompra(d.tipo) ? d.proveedor_id : d.cliente_id;
  const tercero = terceroId ? db.prepare(`SELECT forma_pago FROM ${tabla} WHERE id = ?`).get(terceroId) : null;
  const cab = datosCabecera({ fecha: hoy(), cliente_id: d.cliente_id, proveedor_id: d.proveedor_id, forma_pago: d.forma_pago ?? tercero?.forma_pago ?? null,
    vencimiento: null, referencia: d.referencia, observaciones: d.observaciones, motivo: '',
    ...(destino === 'albaran' ? {} : { valorado: 1 }) }, destino);
  return crearBorrador({ tipo: destino, cab, lineas: d.lineas, usuarioId, origenes: [id] });
}

router.post('/:id/convertir', envolver((req, res) => {
  const destino = tipoValido(req.body.destino);
  if (!destino) throw new ErrorUsuario('Tipo de destino no válido');
  const nuevo = transaccion(() => convertir(Number(req.params.id), destino, req.usuario.id));
  auditar(req, 'documento.convertir', `origen=${req.params.id} → ${destino} ${nuevo}`);
  res.status(201).json(cargarDocumento(nuevo));
}));

// Compatibilidad: «Crear factura» desde cualquier documento facturable
router.post('/:id/facturar', envolver((req, res) => {
  const d = db.prepare('SELECT tipo FROM documentos WHERE id = ?').get(Number(req.params.id));
  if (!d) throw new ErrorUsuario('No encontrado', 404);
  const nuevo = transaccion(() => convertir(Number(req.params.id), facturaDe(d.tipo), req.usuario.id));
  res.status(201).json(cargarDocumento(nuevo));
}));

/** Crea una factura (borrador) que agrupa varios albaranes de un mismo cliente o proveedor. */
function facturarAlbaranes(ids, fecha, usuarioId) {
  const docs = ids.map((i) => cargarDocumento(Number(i)));
  if (!docs.length) throw new ErrorUsuario('Selecciona al menos un albarán');
  const tipoAlb = docs[0]?.tipo;
  for (const d of docs) {
    if (!d || !['albaran', 'albaran_compra'].includes(d.tipo) || d.tipo !== tipoAlb) throw new ErrorUsuario('Solo se pueden agrupar albaranes del mismo tipo');
    const factura = facturaDe(d.tipo);
    if (!TIPOS[d.tipo].facturable.includes(d.estado) || tieneDerivado(d.id, factura)) throw new ErrorUsuario(`El albarán ${d.codigo || d.id} no está pendiente de facturar`, 409);
  }
  const compra = esCompra(tipoAlb);
  const campo = compra ? 'proveedor_id' : 'cliente_id';
  if (new Set(docs.map((d) => d[campo])).size > 1) throw new ErrorUsuario(`Todos los albaranes deben ser del mismo ${compra ? 'proveedor' : 'cliente'}`);
  docs.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
  const indicar = ajustesVentas().indicar_albaran_en_factura;
  const lineas = docs.flatMap((d) => d.lineas.map((l) => ({
    ...l, descripcion: indicar ? `${d.codigo} (${d.fecha.split('-').reverse().join('/')}) · ${l.descripcion}` : l.descripcion,
  }))).map((l, i) => ({ ...l, orden: i }));
  const tercero = db.prepare(`SELECT forma_pago FROM ${compra ? 'proveedores' : 'clientes'} WHERE id = ?`).get(docs[0][campo]);
  const refs = [...new Set(docs.map((d) => d.referencia).filter(Boolean))].join(', ').slice(0, 100);
  const cab = datosCabecera({ fecha: fecha || hoy(), [campo]: docs[0][campo], forma_pago: tercero?.forma_pago ?? docs[0].forma_pago ?? null,
    vencimiento: null, referencia: refs, observaciones: '', motivo: '', valorado: 1 }, facturaDe(tipoAlb));
  return crearBorrador({ tipo: facturaDe(tipoAlb), cab, lineas: limpiarLineas(lineas), usuarioId, origenes: docs.map((d) => d.id) });
}

router.post('/agrupar', envolver((req, res) => {
  const fecha = fechaValida(req.body.fecha) ? req.body.fecha : hoy();
  const nuevo = transaccion(() => facturarAlbaranes(Array.isArray(req.body.ids) ? req.body.ids : [], fecha, req.usuario.id));
  auditar(req, 'albaranes.agrupar', `factura=${nuevo} albaranes=${req.body.ids}`);
  res.status(201).json(cargarDocumento(nuevo));
}));

/** Albaranes de venta pendientes de facturar entre dos fechas, agrupados por cliente. */
function pendientesPorCliente(desde, hasta) {
  const filas = db.prepare(`SELECT d.id, d.codigo, d.fecha, d.total, d.cliente_id, json_extract(d.cliente, '$.nombre') AS cliente_nombre,
      json_extract(d.cliente, '$.nif') AS cliente_nif
    FROM documentos d WHERE d.tipo = 'albaran' AND d.estado IN ('emitido', 'firmado') AND d.fecha BETWEEN ? AND ?
      AND NOT EXISTS (SELECT 1 FROM documentos_origen x JOIN documentos f ON f.id = x.documento_id WHERE x.origen_id = d.id AND f.tipo = 'factura')
    ORDER BY cliente_nombre COLLATE NOCASE, d.fecha, d.numero`).all(desde, hasta);
  const grupos = new Map();
  for (const f of filas) {
    const g = grupos.get(f.cliente_id) || { cliente_id: f.cliente_id, cliente_nombre: f.cliente_nombre, cliente_nif: f.cliente_nif, albaranes: [], total: 0 };
    g.albaranes.push({ id: f.id, codigo: f.codigo, fecha: f.fecha, total: f.total });
    g.total = r2(g.total + f.total);
    grupos.set(f.cliente_id, g);
  }
  return [...grupos.values()];
}

router.get('/facturar-periodo', envolver((req, res) => {
  if (!fechaValida(req.query.desde) || !fechaValida(req.query.hasta)) throw new ErrorUsuario('Indica el periodo');
  res.json(pendientesPorCliente(req.query.desde, req.query.hasta));
}));

// Crea una factura por cliente con sus albaranes pendientes del periodo (opcionalmente las emite)
router.post('/facturar-periodo', envolver((req, res) => {
  const { desde, hasta } = req.body;
  if (!fechaValida(desde) || !fechaValida(hasta)) throw new ErrorUsuario('Indica el periodo');
  const fecha = fechaValida(req.body.fecha) ? req.body.fecha : hasta;
  const soloClientes = Array.isArray(req.body.clientes) ? new Set(req.body.clientes.map(Number)) : null;
  const emitir = req.body.emitir ?? ajustesVentas().facturar_mes_emitir;
  const grupos = pendientesPorCliente(desde, hasta).filter((g) => !soloClientes || soloClientes.has(g.cliente_id));
  const creadas = transaccion(() => grupos.map((g) => facturarAlbaranes(g.albaranes.map((a) => a.id), fecha, req.usuario.id)));
  const resultado = [];
  for (const id of creadas) {
    let error = null;
    // Se emiten por separado: si una falla (p. ej. cliente sin NIF) queda en borrador y las demás siguen
    if (emitir) {
      try { emitirDocumento(id, req); } catch (e) { error = e.message || 'No se pudo emitir'; }
    }
    const d = cargarDocumento(id);
    resultado.push({ id, codigo: d.codigo, estado: d.estado, cliente_nombre: d.cliente.nombre, total: d.total, error });
  }
  auditar(req, 'albaranes.facturar_periodo', `${desde}..${hasta}: ${creadas.length} facturas`);
  res.status(201).json(resultado);
}));

// ---- Firma del receptor en un albarán ----
router.post('/:id/firma', envolver((req, res) => {
  const id = Number(req.params.id);
  const d = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
  if (!d || d.tipo !== 'albaran') throw new ErrorUsuario('Solo los albaranes se firman', 404);
  if (!['emitido', 'firmado'].includes(d.estado)) throw new ErrorUsuario('Emite el albarán antes de firmarlo', 409);
  const nombre = String(req.body.nombre || '').trim().slice(0, 120);
  const dni = String(req.body.dni || '').trim().toUpperCase().slice(0, 20);
  if (!nombre) throw new ErrorUsuario('Indica el nombre de quien recibe');
  let adjuntoId = null;
  if (req.body.imagen) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.imagen));
    if (!m) throw new ErrorUsuario('Firma no válida');
    const png = Buffer.from(m[1], 'base64');
    if (png.length > 500_000 || png.subarray(1, 4).toString() !== 'PNG') throw new ErrorUsuario('Firma no válida');
    adjuntoId = guardarAdjunto({ entidad: 'documento', entidadId: id, nombre: `firma-${d.codigo.replace(/[^\w-]+/g, '-')}.png`, mime: 'image/png', datos: png, usuarioId: req.usuario.id });
  }
  db.prepare("UPDATE documentos SET estado = 'firmado', firma_nombre = ?, firma_dni = ?, firma_fecha = ?, firma_adjunto_id = ?, actualizado = datetime('now') WHERE id = ?")
    .run(nombre, dni, new Date().toISOString(), adjuntoId, id);
  auditar(req, 'albaran.firmar', `${d.codigo} por ${nombre} ${dni}`);
  res.json(cargarDocumento(id));
}));

router.delete('/:id/firma', envolver((req, res) => {
  const id = Number(req.params.id);
  const d = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
  if (!d || d.tipo !== 'albaran' || d.estado !== 'firmado') throw new ErrorUsuario('El albarán no está firmado', 409);
  db.prepare("UPDATE documentos SET estado = 'emitido', firma_nombre = NULL, firma_dni = NULL, firma_fecha = NULL, firma_adjunto_id = NULL WHERE id = ?").run(id);
  auditar(req, 'albaran.quitar_firma', d.codigo, 'aviso');
  res.json(cargarDocumento(id));
}));

// ---- Opciones de ventas y compras ----
router.get('/ajustes-ventas', (_req, res) => res.json(ajustesVentas()));
router.put('/ajustes-ventas', requiereAdmin, (req, res) => {
  const a = ajustesVentas();
  for (const k of Object.keys(VENTAS_DEFECTO)) if (req.body[k] !== undefined) a[k] = !!req.body[k];
  setAjuste('ventas', a);
  auditar(req, 'ajustes.ventas', '', 'aviso');
  res.json(a);
});
router.get('/ajustes-compras', (_req, res) => res.json(ajustesCompras()));
router.put('/ajustes-compras', requiereAdmin, (req, res) => {
  const a = ajustesCompras();
  for (const k of Object.keys(COMPRAS_DEFECTO)) if (req.body[k] !== undefined) a[k] = !!req.body[k];
  setAjuste('compras', a);
  auditar(req, 'ajustes.compras', '', 'aviso');
  res.json(a);
});

/** Datos que necesita el PDF de un documento (los usan también los plugins de diseño). */
export function parametrosPdf(id, opciones = {}) {
  const d = cargarDocumento(Number(id));
  return d ? parametrosDe(d, opciones) : null;
}

function parametrosDe(d, { sinValorar: forzarSin = false, valorar = false } = {}) {
  if (d.estado === 'borrador') d.cliente = snapshotDe(d);
  const empresa = getAjuste('empresa', {});
  const formaPago = d.forma_pago ? db.prepare('SELECT * FROM formas_pago WHERE codigo = ?').get(d.forma_pago) : null;
  const sinValorar = forzarSin || (d.tipo === 'albaran' && !d.valorado && !valorar);
  const firma = d.tipo === 'albaran' ? {
    nombre: d.firma_nombre, dni: d.firma_dni, fecha: d.firma_fecha, imagen: d.firma_adjunto_id ? rutaAdjunto(d.firma_adjunto_id) : null,
  } : null;
  return { doc: d, empresa, formaPago, rectificada: d.rectificada || null, sinValorar, firma,
    vencimientos: ajustesCobros().vencimientos_en_pdf && d.recibos.length > 1 ? d.recibos : null };
}

/** Prepara el PDF de un documento. Un albarán «no valorado» sale sin precios salvo que se pida valorar. */
function prepararPdf(d, opciones = {}) {
  const params = parametrosDe(d, opciones);
  // Los plugins con 'pdf.dibujar' añaden contenido al final del cuerpo (antes del pie). El generador llama a alFinal(pdf, y, { limite, margen }).
  params.alFinal = (pdf, y0, info) => {
    let y = y0;
    for (const { id, fn } of extensionesDe('pdf.dibujar')) {
      try {
        const lugar = { y, limite: info.limite, margen: info.margen, reservar(alto) { if (y + alto > info.limite) { pdf.addPage(); y = info.margen; } return y; } };
        const r = fn(pdf, params, lugar);
        if (typeof r === 'number') y = r;
      } catch (e) { console.error(`El plugin ${id} falló al dibujar en el PDF:`, e.message); }
    }
    return y;
  };
  const { sinValorar } = params;
  // Un plugin de diseño puede dibujar el PDF; si no hay ninguno (o devuelve null) se usa el diseño estándar
  for (const { id, fn } of extensionesDe('pdf.generar')) {
    try {
      const pdf = fn(params);
      if (pdf) return { pdf, sinValorar };
    } catch (e) {
      console.error(`El plugin ${id} falló al generar el PDF; se usa el diseño estándar:`, e.message);
    }
  }
  return { pdf: generarPdf(params), sinValorar };
}


/** Genera el PDF en memoria y lo pasa por los plugins de posproceso (p. ej. firma digital). */
async function pdfFinal(d, opciones = {}) {
  const { pdf, sinValorar } = prepararPdf(d, opciones);
  let buffer = await new Promise((ok, ko) => {
    const trozos = [];
    pdf.on('data', (t) => trozos.push(t));
    pdf.on('end', () => ok(Buffer.concat(trozos)));
    pdf.on('error', ko);
    pdf.end();
  });
  for (const { id, fn } of extensionesDe('pdf.postprocesar')) {
    try {
      const r = await fn(buffer, d);
      if (Buffer.isBuffer(r)) buffer = r;
    } catch (e) {
      console.error(`El plugin ${id} falló al procesar el PDF:`, e.message);
    }
  }
  return { buffer, sinValorar };
}

/** PDF de un documento en memoria (para adjuntarlo a un correo). */
export async function pdfBuffer(id, opciones = {}) {
  const d = cargarDocumento(Number(id));
  if (!d) throw new ErrorUsuario('No encontrado', 404);
  return (await pdfFinal(d, opciones)).buffer;
}

// ---- PDF (?sin_valorar=1 oculta precios; ?valorar=1 fuerza precios en albaranes no valorados; ?descargar=1 lo descarga) ----
router.get('/:id/pdf', async (req, res) => {
  try {
    const d = cargarDocumento(Number(req.params.id));
    if (!d) throw new ErrorUsuario('No encontrado', 404);
    const { buffer, sinValorar } = await pdfFinal(d, { sinValorar: req.query.sin_valorar === '1', valorar: req.query.valorar === '1' });
    const nombre = `${d.tipo}-${(d.codigo || `borrador-${d.id}`).replace(/[^\w.-]+/g, '-')}${sinValorar ? '-sin-valorar' : ''}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.descargar ? 'attachment' : 'inline'}; filename="${nombre}"`);
    res.end(buffer);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ---- Rutas con /:id de un solo tramo (al final para no capturar /agrupar, /ajustes-ventas…) ----
router.get('/:id', envolver((req, res) => {
  const d = cargarDocumento(Number(req.params.id));
  if (!d) throw new ErrorUsuario('No encontrado', 404);
  res.json(d);
}));

router.put('/:id', envolver((req, res) => {
  const id = Number(req.params.id);
  transaccion(() => {
    const actual = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
    if (!actual) throw new ErrorUsuario('No encontrado', 404);
    if (actual.estado !== 'borrador') throw new ErrorUsuario('Solo se pueden modificar borradores. Para corregir una factura emitida, crea una rectificativa.', 409);
    const cab = datosCabecera(req.body, actual.tipo, actual);
    db.prepare(`UPDATE documentos SET serie=?, ejercicio=?, fecha=?, vencimiento=?, cliente_id=?, proveedor_id=?, cliente=?, forma_pago=?,
      referencia=?, numero_proveedor=?, deducible=?, observaciones=?, motivo=?, valorado=? WHERE id = ?`).run(cab.serie, cab.ejercicio, cab.fecha, cab.vencimiento,
      cab.cliente_id, cab.proveedor_id, cab.cliente, cab.forma_pago, cab.referencia, cab.numero_proveedor, cab.deducible, cab.observaciones, cab.motivo, cab.valorado, id);
    if (req.body.lineas) guardarLineasYTotales(id, limpiarLineas(req.body.lineas));
  });
  res.json(cargarDocumento(id));
}));

router.delete('/:id', envolver((req, res) => {
  const id = Number(req.params.id);
  const d = db.prepare('SELECT estado, tipo FROM documentos WHERE id = ?').get(id);
  if (!d) throw new ErrorUsuario('No encontrado', 404);
  if (d.estado !== 'borrador') throw new ErrorUsuario('Solo se pueden borrar borradores. Las facturas emitidas no se pueden eliminar.', 409);
  db.prepare("DELETE FROM adjuntos WHERE entidad = 'documento' AND entidad_id = ?").run(id);
  db.prepare('DELETE FROM documentos WHERE id = ?').run(id);
  auditar(req, `${d.tipo}.borrar`, `id=${id}`);
  res.json({ ok: true });
}));
