// Importa datos de una copia SQL de FacturaScripts (mysqldump) a 7Factura.
//
// Uso:  node scripts/importar-facturascripts.mjs <copia.sql> [--empresa] [--db data/facturador.db]
//
// Importa: formas de pago, clientes (con su dirección de facturación), productos,
// facturas de cliente (con líneas, cobros y rectificativas) y presupuestos.
// Con --empresa también sustituye los datos de tu empresa por los de FacturaScripts.
// Las facturas conservan su número original (p. ej. «29/2026»). Las importadas no tienen
// huella de integridad: la cadena empieza con la primera factura emitida en 7Factura.
// Se niega a importar si la base de datos ya tiene clientes o documentos.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { calcularTotales } from '../shared/fiscal.mjs';

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--db');
const rutaDb = args.includes('--db') ? args[args.indexOf('--db') + 1] : path.resolve('data/facturador.db');
const conEmpresa = args.includes('--empresa');
if (!archivo) {
  console.error('Uso: node scripts/importar-facturascripts.mjs <copia.sql> [--empresa] [--db ruta.db]');
  process.exit(1);
}

// ---------- Lectura del volcado de MySQL ----------
const sql = fs.readFileSync(archivo, 'utf8');

function columnas(tabla) {
  const m = sql.match(new RegExp('CREATE TABLE `' + tabla + '` \\(([\\s\\S]*?)\\n\\) ENGINE'));
  if (!m) return null;
  return [...m[1].matchAll(/^\s+`([^`]+)`/gm)].map((x) => x[1]);
}

// Interpreta la lista de tuplas de un INSERT de mysqldump: ('a',1,NULL),(...)
function tuplas(texto) {
  const filas = [];
  let i = 0;
  const n = texto.length;
  while (i < n) {
    while (i < n && texto[i] !== '(') i++;
    if (i >= n) break;
    i++;
    const fila = [];
    while (i < n) {
      while (texto[i] === ' ') i++;
      if (texto[i] === "'") {
        i++;
        let s = '';
        while (i < n) {
          const c = texto[i];
          if (c === '\\') {
            const e = texto[i + 1];
            s += { n: '\n', r: '\r', t: '\t', 0: '\0', Z: '\x1a' }[e] ?? e;
            i += 2;
          } else if (c === "'") {
            if (texto[i + 1] === "'") { s += "'"; i += 2; } else { i++; break; }
          } else { s += c; i++; }
        }
        fila.push(s);
      } else {
        let j = i;
        while (j < n && texto[j] !== ',' && texto[j] !== ')') j++;
        const raw = texto.slice(i, j).trim();
        fila.push(raw === 'NULL' ? null : Number(raw));
        i = j;
      }
      while (texto[i] === ' ') i++;
      if (texto[i] === ',') { i++; continue; }
      if (texto[i] === ')') { i++; break; }
    }
    filas.push(fila);
  }
  return filas;
}

function tabla(nombre) {
  const cols = columnas(nombre);
  if (!cols) return [];
  const filas = [];
  const re = new RegExp('^INSERT INTO `' + nombre + '` VALUES (.*);$', 'gm');
  for (const m of sql.matchAll(re)) {
    for (const t of tuplas(m[1])) filas.push(Object.fromEntries(cols.map((c, k) => [c, t[k]])));
  }
  return filas;
}

// ---------- Base de datos de destino ----------
if (!fs.existsSync(rutaDb)) {
  console.error(`No existe ${rutaDb}. Arranca 7Factura una vez y completa la instalación antes de importar.`);
  process.exit(1);
}
const db = new DatabaseSync(rutaDb);
db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
const ya = db.prepare('SELECT (SELECT COUNT(*) FROM clientes) + (SELECT COUNT(*) FROM documentos) n').get().n;
if (ya) {
  console.error('La base de datos ya tiene clientes o documentos. La importación solo se hace sobre una instalación vacía.');
  process.exit(1);
}

const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const PAISES = { ESP: 'ES', PRT: 'PT', FRA: 'FR', AND: 'AD', DEU: 'DE', ITA: 'IT', GBR: 'GB' };
const pais = (c) => (c ? PAISES[c] || String(c).slice(0, 2).toUpperCase() : 'ES');
const txt = (v) => (v == null ? '' : String(v).trim());

const fs_ = {
  empresas: tabla('empresas'),
  formas: tabla('formaspago'),
  series: tabla('series'),
  clientes: tabla('clientes'),
  contactos: tabla('contactos'),
  productos: tabla('productos'),
  variantes: tabla('variantes'),
  impuestos: tabla('impuestos'),
  facturas: tabla('facturascli'),
  lineasF: tabla('lineasfacturascli'),
  recibos: tabla('recibospagoscli'),
  presupuestos: tabla('presupuestoscli'),
  lineasP: tabla('lineaspresupuestoscli'),
  estados: tabla('estados_documentos'),
  settings: tabla('settings'),
};

const resumen = {};
const avisos = [];

db.exec('BEGIN IMMEDIATE');
try {
  // Empresa (opcional)
  if (conEmpresa && fs_.empresas[0]) {
    const e = fs_.empresas[0];
    const actual = JSON.parse(db.prepare("SELECT valor FROM ajustes WHERE clave = 'empresa'").get()?.valor || '{}');
    let pie = actual.pie_factura || '';
    const pp = fs_.settings.find((s) => s.name === 'plantillaspdf');
    if (pp) { try { pie = JSON.parse(pp.properties).endtext || pie; } catch { /* sin texto */ } }
    const empresa = {
      ...actual,
      razon_social: txt(e.nombre), nif: txt(e.cifnif).toUpperCase().replace(/[\s.-]/g, ''), direccion: txt(e.direccion),
      cp: txt(e.codpostal), ciudad: txt(e.ciudad), provincia: txt(e.provincia), telefono: txt(e.telefono1),
      email: txt(e.email), pie_factura: pie,
    };
    db.prepare("INSERT INTO ajustes(clave, valor) VALUES ('empresa', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(JSON.stringify(empresa));
    resumen.empresa = empresa.razon_social;
  }

  // Formas de pago
  const insFp = db.prepare('INSERT OR IGNORE INTO formas_pago(codigo, descripcion, dias, muestra_iban) VALUES (?,?,?,?)');
  for (const f of fs_.formas) {
    const dias = f.tipovencimiento === 'months' ? Number(f.plazovencimiento) * 30 : f.tipovencimiento === 'weeks' ? Number(f.plazovencimiento) * 7 : Number(f.plazovencimiento) || 0;
    insFp.run(f.codpago, txt(f.descripcion) || f.codpago, dias, /TRANS/i.test(f.codpago) ? 1 : 0);
  }
  resumen.formas_pago = fs_.formas.length;

  // Series: las rectificativas de FacturaScripts (tipo R) se crean como rectificativas
  const insSerie = db.prepare('INSERT OR IGNORE INTO series(codigo, descripcion, tipo, formato) VALUES (?,?,?,?)');
  for (const s of fs_.series) {
    const tipo = s.tipo === 'R' ? 'rectificativa' : s.tipo === 'S' ? 'simplificada' : 'normal';
    insSerie.run(s.codserie, txt(s.descripcion) || s.codserie, tipo, tipo === 'normal' ? '{num}/{año}' : `${s.codserie}{num}/{año}`);
  }

  // Clientes
  const contactoPorId = new Map(fs_.contactos.map((c) => [c.idcontacto, c]));
  const insCli = db.prepare(`INSERT INTO clientes(nombre, nif, direccion, cp, ciudad, provincia, pais, email, telefono, forma_pago, notas, recargo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const idCliente = new Map();
  for (const c of fs_.clientes) {
    const k = contactoPorId.get(c.idcontactofact) || {};
    const fp = c.codpago && db.prepare('SELECT 1 FROM formas_pago WHERE codigo = ?').get(c.codpago) ? c.codpago : null;
    const r = insCli.run(txt(c.razonsocial) || txt(c.nombre), txt(c.cifnif).toUpperCase(), txt(k.direccion), txt(k.codpostal), txt(k.ciudad),
      txt(k.provincia), pais(k.codpais), txt(c.email || k.email), txt(c.telefono1 || k.telefono1), fp, txt(c.observaciones),
      /recargo/i.test(String(c.regimeniva || '')) ? 1 : 0);
    idCliente.set(String(c.codcliente), Number(r.lastInsertRowid));
  }
  resumen.clientes = idCliente.size;

  // Productos (una entrada por variante, con el IVA de su impuesto)
  const ivaDe = new Map(fs_.impuestos.map((i) => [i.codimpuesto, Number(i.iva)]));
  const prodPorId = new Map(fs_.productos.map((p) => [p.idproducto, p]));
  const insProd = db.prepare('INSERT INTO productos(referencia, descripcion, precio, iva, activo) VALUES (?,?,?,?,?)');
  const idProducto = new Map();
  for (const v of fs_.variantes) {
    const p = prodPorId.get(v.idproducto);
    if (!p) continue;
    const r = insProd.run(txt(v.referencia), txt(p.descripcion) || txt(v.referencia), Number(v.precio) || 0, ivaDe.get(p.codimpuesto) ?? 21, p.bloqueado ? 0 : 1);
    idProducto.set(p.idproducto, Number(r.lastInsertRowid));
  }
  resumen.productos = idProducto.size;

  const insDoc = db.prepare(`INSERT INTO documentos(tipo, serie, ejercicio, numero, codigo, fecha, vencimiento, cliente_id, cliente, estado,
      forma_pago, observaciones, neto, total_iva, total_irpf, total, motivo, emitida_en, pagada_en)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insLin = db.prepare(`INSERT INTO lineas(documento_id, orden, producto_id, descripcion, cantidad, precio, dto, iva, irpf, recargo, operacion, suplido)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  // Calificación del IVA según las excepciones de FacturaScripts
  const opDe = (l) => {
    const e = String(l.excepcioniva || '').toUpperCase();
    if (/^(E[1-6])/.test(e)) return e.slice(0, 2);
    if (/ISP|PASIVO/.test(e)) return 'S2';
    if (/N1|NO_SUJETA$/.test(e)) return 'N1';
    if (/N2|LOCALIZ/.test(e)) return 'N2';
    return 'S1';
  };

  function lineasDe(lineas, campoId, id, docId) {
    const propias = lineas.filter((l) => l[campoId] === id).sort((a, b) => (Number(a.orden) - Number(b.orden)) || (a.idlinea - b.idlinea));
    const nuevas = propias.map((l, k) => {
      // Dos descuentos encadenados equivalen a uno: 1 - (1-a)(1-b)
      const dto = r2(100 * (1 - (1 - (Number(l.dtopor) || 0) / 100) * (1 - (Number(l.dtopor2) || 0) / 100)));
      const operacion = opDe(l);
      const n = { cantidad: Number(l.cantidad), precio: Number(l.pvpunitario), dto, iva: Number(l.iva) || 0, irpf: Number(l.irpf) || 0,
        recargo: Number(l.recargo) || 0, operacion, suplido: l.suplido ? 1 : 0 };
      insLin.run(docId, k, idProducto.get(l.idproducto) ?? null, txt(l.descripcion), n.cantidad, n.precio, n.dto, n.iva, n.irpf, n.recargo, n.operacion, n.suplido);
      return n;
    });
    const t = calcularTotales(nuevas);
    return { neto: t.neto, iva: t.totalIva, recargo: t.totalRecargo, irpf: t.totalIrpf, suplidos: t.totalSuplidos, total: t.total };
  }

  function snapshot(d) {
    return JSON.stringify({
      id: idCliente.get(String(d.codcliente)) ?? null, nombre: txt(d.nombrecliente), nif: txt(d.cifnif).toUpperCase(), direccion: txt(d.direccion),
      cp: txt(d.codpostal), ciudad: txt(d.ciudad), provincia: txt(d.provincia), pais: pais(d.codpais), email: txt(d.femail),
    });
  }

  // Facturas
  const recibosDe = new Map();
  for (const r of fs_.recibos) {
    if (!recibosDe.has(r.idfactura)) recibosDe.set(r.idfactura, []);
    recibosDe.get(r.idfactura).push(r);
  }
  const idFactura = new Map();
  const ordenadas = [...fs_.facturas].sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(a.numero) - Number(b.numero));
  for (const f of ordenadas) {
    const recibos = recibosDe.get(f.idfactura) || [];
    const vencimiento = recibos.map((r) => r.vencimiento).filter(Boolean).sort().at(-1) || null;
    const pagadaEn = f.pagada ? (recibos.map((r) => r.fechapago).filter(Boolean).sort().at(-1) || f.fecha) : null;
    const fp = f.codpago && db.prepare('SELECT 1 FROM formas_pago WHERE codigo = ?').get(f.codpago) ? f.codpago : null;
    const r = insDoc.run('factura', f.codserie, Number(f.codejercicio) || Number(f.fecha.slice(0, 4)), Number(f.numero), txt(f.codigo), f.fecha,
      vencimiento, idCliente.get(String(f.codcliente)) ?? null, snapshot(f), f.pagada ? 'pagada' : 'emitida', fp, txt(f.observaciones),
      0, 0, 0, 0, '', `${f.fecha}T${f.hora || '00:00:00'}`, pagadaEn);
    const docId = Number(r.lastInsertRowid);
    idFactura.set(f.idfactura, docId);
    const t = lineasDe(fs_.lineasF, 'idfactura', f.idfactura, docId);
    db.prepare('UPDATE documentos SET neto = ?, total_iva = ?, total_recargo = ?, total_irpf = ?, total_suplidos = ?, total = ? WHERE id = ?').run(t.neto, t.iva, t.recargo, t.irpf, t.suplidos, t.total, docId);
    if (Math.abs(t.total - Number(f.total)) > 0.01) avisos.push(`Factura ${f.codigo}: total recalculado ${t.total} ≠ ${f.total} en FacturaScripts`);
    // Recibos y cobros tal como estaban en FacturaScripts (o uno solo si no había)
    const insR = db.prepare('INSERT INTO recibos(documento_id, numero, importe, vencimiento, forma_pago) VALUES (?,?,?,?,?)');
    const insC = db.prepare("INSERT INTO cobros(recibo_id, fecha, importe, forma_pago, notas) VALUES (?,?,?,?,'Importado de FacturaScripts')");
    const lista = recibos.length ? [...recibos].sort((a, b) => String(a.vencimiento).localeCompare(String(b.vencimiento))) : [{ importe: t.total, vencimiento: vencimiento || f.fecha, pagado: f.pagada, fechapago: pagadaEn, codpago: f.codpago }];
    let cobrado = 0;
    lista.forEach((rc, k) => {
      const fpR = rc.codpago && db.prepare('SELECT 1 FROM formas_pago WHERE codigo = ?').get(rc.codpago) ? rc.codpago : fp;
      const rid = Number(insR.run(docId, k + 1, r2(rc.importe), rc.vencimiento || f.fecha, fpR).lastInsertRowid);
      if (rc.pagado) { insC.run(rid, rc.fechapago || rc.vencimiento || f.fecha, r2(rc.importe), fpR); cobrado += Number(rc.importe); }
    });
    db.prepare('UPDATE documentos SET cobrado = ? WHERE id = ?').run(r2(cobrado), docId);
  }
  for (const f of fs_.facturas) {
    if (f.idfacturarect && idFactura.has(f.idfacturarect)) {
      db.prepare('UPDATE documentos SET rectifica_id = ? WHERE id = ?').run(idFactura.get(f.idfacturarect), idFactura.get(f.idfactura));
    }
  }
  resumen.facturas = idFactura.size;
  resumen.lineas_factura = fs_.lineasF.length;

  // Presupuestos
  const nombreEstado = new Map(fs_.estados.map((e) => [e.idestado, txt(e.nombre).toLowerCase()]));
  const estadoPresupuesto = (id) => {
    const n = nombreEstado.get(id) || '';
    if (n.includes('rechaz') || n.includes('caduc') || n.includes('cancel')) return 'rechazado';
    if (n.includes('factur') || n.includes('pedido')) return 'facturado';
    return 'emitido';
  };
  let nPres = 0;
  for (const p of [...fs_.presupuestos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const r = insDoc.run('presupuesto', 'PRE', Number(p.codejercicio) || Number(p.fecha.slice(0, 4)), Number(p.numero), txt(p.codigo), p.fecha,
      p.finoferta || null, idCliente.get(String(p.codcliente)) ?? null, snapshot(p), estadoPresupuesto(p.idestado), null, txt(p.observaciones),
      0, 0, 0, 0, '', `${p.fecha}T${p.hora || '00:00:00'}`, null);
    const docId = Number(r.lastInsertRowid);
    const t = lineasDe(fs_.lineasP, 'idpresupuesto', p.idpresupuesto, docId);
    db.prepare('UPDATE documentos SET neto = ?, total_iva = ?, total_recargo = ?, total_irpf = ?, total_suplidos = ?, total = ? WHERE id = ?').run(t.neto, t.iva, t.recargo, t.irpf, t.suplidos, t.total, docId);
    nPres++;
  }
  resumen.presupuestos = nPres;

  db.prepare('INSERT INTO auditoria(usuario, accion, detalle) VALUES (?,?,?)').run('importador', 'importar.facturascripts', JSON.stringify(resumen));
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('Importación cancelada, no se ha cambiado nada:', e.message);
  process.exit(1);
}

console.log('Importación completada:');
for (const [k, v] of Object.entries(resumen)) console.log(`  ${k}: ${v}`);
if (avisos.length) {
  console.log('\nAvisos:');
  for (const a of avisos) console.log(`  - ${a}`);
}
