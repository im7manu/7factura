// Instalación inicial, sesión, ajustes, clientes, productos, usuarios e informes.
import { Router } from 'express';
import { db, getAjuste, setAjuste, transaccion, auditar } from '../db.mjs';
import { hashPassword, errorPassword, login, crearSesion, cerrarSesion, requiereSesion, requiereAdmin } from '../auth.mjs';
import { validarNif, validarIban, normalizarNif } from '../lib/nif.mjs';
import { r2, calcularTotales, OPERACIONES } from '../lib/totales.mjs';
import { limpiarPlazos, ajustesCobros } from './cobros.mjs';
import { ajustesVentas, ajustesCompras } from './documentos.mjs';
import { extensionesDe } from '../plugins.mjs';
import { VERSION } from '../actualizaciones.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const publico = Router();
export const privado = Router();

const texto = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const hayUsuarios = () => !!db.prepare('SELECT 1 FROM usuarios LIMIT 1').get();

// Limitador sencillo por IP para login/setup
const intentosIp = new Map();
function limitar(req, res, next) {
  const ahora = Date.now();
  const e = intentosIp.get(req.ip) || { n: 0, desde: ahora };
  if (ahora - e.desde > 60_000) { e.n = 0; e.desde = ahora; }
  e.n++;
  intentosIp.set(req.ip, e);
  if (e.n > 20) return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' });
  next();
}

function datosEmpresa(body) {
  const e = {
    razon_social: texto(body.razon_social, 200),
    nif: normalizarNif(body.nif),
    direccion: texto(body.direccion, 200),
    cp: texto(body.cp, 10),
    ciudad: texto(body.ciudad, 100),
    provincia: texto(body.provincia, 100),
    telefono: texto(body.telefono, 30),
    email: texto(body.email, 150),
    iban: texto(body.iban, 40).toUpperCase().replace(/\s/g, ''),
    pie_factura: texto(body.pie_factura, 1500),
  };
  if (!e.razon_social) throw new Error('La razón social es obligatoria');
  if (!validarNif(e.nif).valido) throw new Error('El NIF de la empresa no es válido');
  if (e.iban && !validarIban(e.iban)) throw new Error('El IBAN no es válido');
  return e;
}

// ---------- Público ----------
publico.get('/estado', (req, res) => {
  res.json({
    instalado: hayUsuarios(),
    usuario: req.usuario || null,
    empresa: req.usuario ? getAjuste('empresa', null) : null,
    version: req.usuario ? VERSION : undefined,
  });
});

// Apariencia (tema y fotos de inicio de sesión). Pública: la pantalla de inicio de sesión la necesita sin sesión.
function proveedorApariencia() {
  for (const { id, fn } of extensionesDe('apariencia')) {
    try { const a = fn(); if (a) return a; } catch (e) { console.error(`El plugin ${id} falló al dar la apariencia:`, e.message); }
  }
  return null;
}
publico.get('/apariencia', (_req, res) => {
  const a = proveedorApariencia();
  res.setHeader('Cache-Control', 'no-cache');
  res.json(a ? { tema: a.tema || null, fondos: (a.fondos || []).map((f) => `/api/apariencia/archivo/${encodeURIComponent(f.nombre)}`),
    intervalo: a.intervalo || 8, texto_login: a.texto_login || '' } : { tema: null, fondos: [] });
});
// Archivos públicos del tema (fotos de inicio de sesión, fuentes): solo los que declara el plugin, sin rutas
publico.get('/apariencia/archivo/:nombre', (req, res) => {
  const a = proveedorApariencia();
  const nombre = String(req.params.nombre);
  const f = [...(a?.fondos || []), ...(a?.archivos || [])].find((x) => x.nombre === nombre);
  if (!f || !/^[\w.-]{1,100}$/.test(nombre) || !f.ruta || !fs.existsSync(f.ruta)) return res.status(404).end();
  const tipos = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.css': 'text/css' };
  const tipo = tipos[path.extname(f.ruta).toLowerCase()];
  if (!tipo) return res.status(404).end();
  res.setHeader('Content-Type', tipo);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(f.ruta).pipe(res);
});

publico.post('/setup', limitar, (req, res) => {
  try {
    const u = req.body.usuario || {};
    const ep = errorPassword(u.password);
    if (ep) throw new Error(ep);
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(u.usuario || '')) throw new Error('Usuario no válido (3-30 caracteres: letras, números, . _ -)');
    if (!texto(u.nombre)) throw new Error('Indica tu nombre');
    const empresa = datosEmpresa(req.body.empresa || {});
    const id = transaccion(() => {
      if (hayUsuarios()) throw new Error('La aplicación ya está instalada');
      setAjuste('empresa', empresa);
      setAjuste('serie_defecto', 'A');
      return Number(db.prepare("INSERT INTO usuarios(usuario, nombre, email, hash, rol) VALUES (?,?,?,?, 'admin')")
        .run(u.usuario, texto(u.nombre, 100), texto(u.email, 150), hashPassword(u.password)).lastInsertRowid);
    });
    crearSesion(res, req, id);
    auditar({ usuario: { usuario: u.usuario }, ip: req.ip }, 'setup');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

publico.post('/login', limitar, (req, res) => {
  const r = login(req.body.usuario, req.body.password, req.ip);
  if (r.error) {
    auditar({ ip: req.ip, usuario: { usuario: String(req.body.usuario || '').slice(0, 50) } }, r.evento, '', r.severidad);
    return res.status(r.evento === 'login.ip_bloqueada' ? 429 : 401).json({ error: r.error });
  }
  crearSesion(res, req, r.usuario.id);
  auditar({ ip: req.ip, usuario: r.usuario }, 'login');
  res.json({ ok: true });
});

publico.post('/logout', (req, res) => {
  cerrarSesion(req, res);
  res.json({ ok: true });
});

// ---------- Privado (requiere sesión) ----------
privado.use(requiereSesion);

privado.get('/utilidades/nif', (req, res) => res.json(validarNif(req.query.v)));

// Ajustes generales
privado.get('/ajustes', (_req, res) => {
  res.json({
    empresa: getAjuste('empresa', {}),
    serie_defecto: getAjuste('serie_defecto', 'A'),
    series: db.prepare('SELECT * FROM series ORDER BY codigo').all(),
    formas_pago: db.prepare('SELECT * FROM formas_pago ORDER BY descripcion').all().map((f) => ({ ...f, plazos: f.plazos ? JSON.parse(f.plazos) : null })),
    registro_plugins: getAjuste('registro_plugins', null),
    formatos: { presupuesto: 'P{num}/{año}', proforma: 'PF{num}/{año}', ...getAjuste('formatos', {}) },
    cobros: ajustesCobros(),
    ventas: ajustesVentas(),
    compras: ajustesCompras(),
  });
});

privado.put('/ajustes/empresa', requiereAdmin, (req, res) => {
  try {
    setAjuste('empresa', datosEmpresa(req.body));
    auditar(req, 'ajustes.empresa', '', 'aviso');
    res.json(getAjuste('empresa'));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

privado.put('/ajustes/general', requiereAdmin, (req, res) => {
  const serie = texto(req.body.serie_defecto, 10);
  if (serie) {
    const s = db.prepare('SELECT tipo FROM series WHERE codigo = ?').get(serie);
    if (!s || s.tipo !== 'normal') return res.status(400).json({ error: 'La serie por defecto debe existir y ser de tipo normal' });
    setAjuste('serie_defecto', serie);
  }
  if (req.body.formatos !== undefined) {
    const f = {};
    for (const tipo of ['presupuesto', 'proforma']) {
      const v = texto(req.body.formatos?.[tipo], 30);
      if (v && !v.includes('{num')) return res.status(400).json({ error: `El formato de ${tipo} debe incluir {num} o {num4}` });
      if (v) f[tipo] = v;
    }
    setAjuste('formatos', f);
  }
  if (req.body.registro_plugins !== undefined) {
    const url = texto(req.body.registro_plugins, 500);
    if (url && !/^https:\/\//.test(url)) return res.status(400).json({ error: 'El registro de plugins debe ser una URL https' });
    setAjuste('registro_plugins', url || null);
  }
  res.json({ ok: true });
});

privado.post('/series', requiereAdmin, (req, res) => {
  const codigo = texto(req.body.codigo, 4).toUpperCase();
  if (!/^[A-Z0-9]{1,4}$/.test(codigo) || codigo === 'PRE') return res.status(400).json({ error: 'Código de serie no válido (1-4 letras o números)' });
  const tipo = ['normal', 'rectificativa', 'simplificada'].includes(req.body.tipo) ? req.body.tipo : 'normal';
  try {
    const formato = texto(req.body.formato, 30) || (tipo === 'normal' ? `${codigo}{num}/{año}` : `${codigo}{num}/{año}`);
    if (!formato.includes('{num')) return res.status(400).json({ error: 'El formato debe incluir {num} o {num4}' });
    db.prepare('INSERT INTO series(codigo, descripcion, tipo, formato) VALUES (?,?,?,?)').run(codigo, texto(req.body.descripcion, 100) || codigo, tipo, formato);
    res.status(201).json({ ok: true });
  } catch { res.status(409).json({ error: 'Esa serie ya existe' }); }
});

privado.put('/series/:codigo', requiereAdmin, (req, res) => {
  const s = db.prepare('SELECT * FROM series WHERE codigo = ?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'No encontrada' });
  const formato = texto(req.body.formato, 30) || s.formato;
  if (!formato.includes('{num')) return res.status(400).json({ error: 'El formato debe incluir {num} o {num4}' });
  db.prepare('UPDATE series SET descripcion = ?, formato = ? WHERE codigo = ?').run(texto(req.body.descripcion, 100) || s.descripcion, formato, s.codigo);
  auditar(req, 'serie.editar', `${s.codigo}: ${s.formato} → ${formato}`, 'aviso');
  res.json({ ok: true });
});

privado.delete('/series/:codigo', requiereAdmin, (req, res) => {
  const usada = db.prepare('SELECT 1 FROM documentos WHERE serie = ? LIMIT 1').get(req.params.codigo);
  if (usada) return res.status(409).json({ error: 'La serie tiene documentos y no se puede borrar' });
  db.prepare('DELETE FROM series WHERE codigo = ?').run(req.params.codigo);
  res.json({ ok: true });
});

privado.post('/formas-pago', requiereAdmin, (req, res) => {
  const codigo = texto(req.body.codigo, 10).toUpperCase();
  if (!/^[A-Z0-9_]{1,10}$/.test(codigo)) return res.status(400).json({ error: 'Código no válido' });
  let plazos;
  try { plazos = limpiarPlazos(req.body.plazos); } catch (e) { return res.status(400).json({ error: e.message }); }
  db.prepare(`INSERT INTO formas_pago(codigo, descripcion, dias, muestra_iban, plazos) VALUES (?,?,?,?,?)
    ON CONFLICT(codigo) DO UPDATE SET descripcion=excluded.descripcion, dias=excluded.dias, muestra_iban=excluded.muestra_iban, plazos=excluded.plazos`)
    .run(codigo, texto(req.body.descripcion, 100) || codigo, Math.max(0, Number(req.body.dias) || 0), req.body.muestra_iban ? 1 : 0,
      plazos && plazos.length > 1 ? JSON.stringify(plazos) : null);
  auditar(req, 'forma_pago.guardar', codigo);
  res.json({ ok: true });
});

privado.delete('/formas-pago/:codigo', requiereAdmin, (req, res) => {
  const usada = db.prepare('SELECT 1 FROM documentos WHERE forma_pago = ? UNION SELECT 1 FROM clientes WHERE forma_pago = ? LIMIT 1')
    .get(req.params.codigo, req.params.codigo);
  if (usada) return res.status(409).json({ error: 'Está en uso por documentos o clientes' });
  db.prepare('DELETE FROM formas_pago WHERE codigo = ?').run(req.params.codigo);
  res.json({ ok: true });
});

// Clientes y proveedores: ver routes/terceros.mjs

// Productos / servicios
function datosProducto(b) {
  const p = { referencia: texto(b.referencia, 50), descripcion: texto(b.descripcion, 500), precio: Number(b.precio) || 0,
    iva: Number(b.iva ?? 21), activo: b.activo === false ? 0 : 1 };
  if (!p.descripcion) throw new Error('La descripción es obligatoria');
  if (!Number.isFinite(p.precio) || p.iva < 0 || p.iva > 100) throw new Error('Precio o IVA no válidos');
  return p;
}
privado.get('/productos', (_req, res) => res.json(db.prepare('SELECT * FROM productos ORDER BY activo DESC, descripcion COLLATE NOCASE').all()));
privado.post('/productos', (req, res) => {
  try {
    const p = datosProducto(req.body);
    const r = db.prepare('INSERT INTO productos(referencia, descripcion, precio, iva, activo) VALUES (?,?,?,?,?)').run(p.referencia, p.descripcion, p.precio, p.iva, p.activo);
    res.status(201).json(db.prepare('SELECT * FROM productos WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
privado.put('/productos/:id', (req, res) => {
  try {
    const p = datosProducto(req.body);
    db.prepare('UPDATE productos SET referencia=?, descripcion=?, precio=?, iva=?, activo=? WHERE id = ?').run(p.referencia, p.descripcion, p.precio, p.iva, p.activo, req.params.id);
    res.json(db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
privado.delete('/productos/:id', (req, res) => {
  const p = db.prepare('SELECT descripcion FROM productos WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
  if (p) auditar(req, 'producto.borrar', p.descripcion);
  res.json({ ok: true });
});

// Usuarios (solo admin)
privado.get('/usuarios', requiereAdmin, (_req, res) => {
  res.json(db.prepare('SELECT id, usuario, nombre, email, rol, activo, ultimo_login, creado FROM usuarios ORDER BY usuario').all());
});
privado.post('/usuarios', requiereAdmin, (req, res) => {
  const b = req.body;
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(b.usuario || '')) return res.status(400).json({ error: 'Usuario no válido' });
  const ep = errorPassword(b.password);
  if (ep) return res.status(400).json({ error: ep });
  try {
    db.prepare('INSERT INTO usuarios(usuario, nombre, email, hash, rol) VALUES (?,?,?,?,?)')
      .run(b.usuario, texto(b.nombre, 100) || b.usuario, texto(b.email, 150), hashPassword(b.password), b.rol === 'admin' ? 'admin' : 'usuario');
    auditar(req, 'usuario.crear', b.usuario);
    res.status(201).json({ ok: true });
  } catch { res.status(409).json({ error: 'Ese usuario ya existe' }); }
});
privado.put('/usuarios/:id', requiereAdmin, (req, res) => {
  const id = Number(req.params.id);
  const b = req.body;
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'No encontrado' });
  const rol = b.rol === 'admin' ? 'admin' : b.rol === 'usuario' ? 'usuario' : u.rol;
  const activo = b.activo === undefined ? u.activo : (b.activo ? 1 : 0);
  if (u.rol === 'admin' && (rol !== 'admin' || !activo)) {
    const otros = db.prepare("SELECT COUNT(*) n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id <> ?").get(id).n;
    if (!otros) return res.status(409).json({ error: 'Debe quedar al menos un administrador activo' });
  }
  const ep = b.password ? errorPassword(b.password) : null;
  if (ep) return res.status(400).json({ error: ep });
  db.prepare('UPDATE usuarios SET nombre=?, email=?, rol=?, activo=?, hash=? WHERE id = ?')
    .run(texto(b.nombre, 100) || u.nombre, texto(b.email ?? u.email, 150), rol, activo, b.password ? hashPassword(b.password) : u.hash, id);
  // Cierra las sesiones del usuario si se desactiva o si un admin le cambia la contraseña
  if (!activo || (b.password && id !== req.usuario.id)) db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(id);
  auditar(req, 'usuario.editar', `${u.usuario}${b.password ? ' (contraseña cambiada)' : ''}${rol !== u.rol ? ` rol ${u.rol} → ${rol}` : ''}${activo !== u.activo ? (activo ? ' activado' : ' desactivado') : ''}`, rol !== u.rol || b.password ? 'aviso' : 'info');
  res.json({ ok: true });
});
privado.get('/auditoria', requiereAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM auditoria ORDER BY id DESC LIMIT 300').all());
});

// Resumen para el inicio
privado.get('/resumen', (_req, res) => {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const trimestre = Math.floor(ahora.getMonth() / 3) + 1;
  const iniT = `${anio}-${String((trimestre - 1) * 3 + 1).padStart(2, '0')}-01`;
  const finT = `${anio}-${String(trimestre * 3).padStart(2, '0')}-31`;
  const emitidas = "tipo = 'factura' AND numero IS NOT NULL";
  const sum = (where, ...p) => db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(neto),0) neto, COALESCE(SUM(total_iva),0) iva,
    COALESCE(SUM(total),0) total FROM documentos WHERE ${emitidas} AND ${where}`).get(...p);
  const hoyIso = ahora.toLocaleDateString('sv-SE');
  const meses = db.prepare(`SELECT substr(fecha,1,7) mes, COALESCE(SUM(neto),0) neto FROM documentos
    WHERE ${emitidas} AND fecha >= date('now','start of month','-11 months') GROUP BY mes ORDER BY mes`).all();
  res.json({
    anio, trimestre,
    ejercicio: sum('ejercicio = ?', anio),
    trimestre_actual: sum('fecha BETWEEN ? AND ?', iniT, finT),
    pendiente: db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total - cobrado), 0) total FROM documentos
      WHERE ${emitidas} AND estado = 'emitida'`).get(),
    vencidas: db.prepare(`SELECT COUNT(DISTINCT r.documento_id) n, COALESCE(SUM(r.importe - COALESCE((SELECT SUM(importe) FROM cobros WHERE recibo_id = r.id), 0)), 0) total
      FROM recibos r JOIN documentos d ON d.id = r.documento_id
      WHERE d.estado = 'emitida' AND r.vencimiento < ?
        AND ABS(r.importe - COALESCE((SELECT SUM(importe) FROM cobros WHERE recibo_id = r.id), 0)) >= 0.005`).get(hoyIso),
    borradores: db.prepare("SELECT COUNT(*) n FROM documentos WHERE tipo = 'factura' AND estado = 'borrador'").get().n,
    presupuestos_abiertos: db.prepare("SELECT COUNT(*) n FROM documentos WHERE tipo = 'presupuesto' AND estado IN ('emitido','aceptado')").get().n,
    clientes: db.prepare('SELECT COUNT(*) n FROM clientes').get().n,
    meses,
    ultimas: db.prepare(`SELECT id, codigo, fecha, estado, total, json_extract(cliente,'$.nombre') cliente_nombre FROM documentos
      WHERE tipo = 'factura' ORDER BY id DESC LIMIT 6`).all(),
  });
});

// Informes fiscales básicos (lado ventas): IVA por trimestre y clientes por encima del umbral del 347
/** Desglose de IVA de los documentos emitidos de unos tipos en un periodo. */
function desgloseIva(tipos, ini, fin, extra = '') {
  const docs = db.prepare(`SELECT id FROM documentos WHERE tipo IN (${tipos.map(() => '?').join(',')}) AND numero IS NOT NULL
    AND fecha BETWEEN ? AND ? ${extra}`).all(...tipos, ini, fin);
  const grupos = new Map();
  const tot = { n: docs.length, neto: 0, iva: 0, recargo: 0, irpf: 0, suplidos: 0, total: 0 };
  const linSt = db.prepare('SELECT * FROM lineas WHERE documento_id = ?');
  for (const d of docs) {
    const tt = calcularTotales(linSt.all(d.id));
    tot.neto += tt.neto; tot.iva += tt.totalIva; tot.recargo += tt.totalRecargo; tot.irpf += tt.totalIrpf;
    tot.suplidos += tt.totalSuplidos; tot.total += tt.total;
    for (const g of tt.desglose) {
      const k = `${g.operacion}|${g.tipo}|${g.recargo}`;
      const a = grupos.get(k) || { operacion: g.operacion, tipo: g.tipo, recargo: g.recargo, base: 0, cuota: 0, cuotaRecargo: 0 };
      a.base = r2(a.base + g.base); a.cuota = r2(a.cuota + g.cuota); a.cuotaRecargo = r2(a.cuotaRecargo + g.cuotaRecargo);
      grupos.set(k, a);
    }
  }
  for (const k of Object.keys(tot)) if (k !== 'n') tot[k] = r2(tot[k]);
  return { ...tot, porTipo: [...grupos.values()].sort((a, b) => a.operacion.localeCompare(b.operacion) || b.tipo - a.tipo) };
}

privado.get('/informes/ejercicio/:anio', (req, res) => {
  const anio = Number(req.params.anio);
  const trimestres = [1, 2, 3, 4].map((t) => {
    const ini = `${anio}-${String((t - 1) * 3 + 1).padStart(2, '0')}-01`;
    const fin = `${anio}-${String(t * 3).padStart(2, '0')}-31`;
    const ventas = desgloseIva(['factura'], ini, fin);
    // IVA soportado deducible: facturas recibidas y gastos marcados como deducibles
    const compras = desgloseIva(['factura_compra', 'gasto'], ini, fin, 'AND deducible = 1');
    return { trimestre: t, ...ventas, soportado: compras, resultado: r2(ventas.iva + ventas.recargo - compras.iva) };
  });
  const m347 = db.prepare(`SELECT cliente_id, json_extract(cliente,'$.nombre') nombre, json_extract(cliente,'$.nif') nif,
      SUM(total) total,
      SUM(CASE WHEN CAST(substr(fecha,6,2) AS INTEGER) BETWEEN 1 AND 3 THEN total ELSE 0 END) t1,
      SUM(CASE WHEN CAST(substr(fecha,6,2) AS INTEGER) BETWEEN 4 AND 6 THEN total ELSE 0 END) t2,
      SUM(CASE WHEN CAST(substr(fecha,6,2) AS INTEGER) BETWEEN 7 AND 9 THEN total ELSE 0 END) t3,
      SUM(CASE WHEN CAST(substr(fecha,6,2) AS INTEGER) BETWEEN 10 AND 12 THEN total ELSE 0 END) t4
    FROM documentos WHERE tipo = 'factura' AND numero IS NOT NULL AND ejercicio = ?
    GROUP BY cliente_id HAVING SUM(total) > 3005.06 ORDER BY total DESC`).all(anio);
  const m347prov = db.prepare(`SELECT proveedor_id, json_extract(cliente,'$.nombre') nombre, json_extract(cliente,'$.nif') nif,
      SUM(total) total,
      SUM(CASE WHEN CAST(substr(fecha,6,2) AS INTEGER) BETWEEN 1 AND 3 THEN total ELSE 0 END) t1,
      SUM(CASE WHEN CAST(substr(fecha,6,2) AS INTEGER) BETWEEN 4 AND 6 THEN total ELSE 0 END) t2,
      SUM(CASE WHEN CAST(substr(fecha,6,2) AS INTEGER) BETWEEN 7 AND 9 THEN total ELSE 0 END) t3,
      SUM(CASE WHEN CAST(substr(fecha,6,2) AS INTEGER) BETWEEN 10 AND 12 THEN total ELSE 0 END) t4
    FROM documentos WHERE tipo = 'factura_compra' AND numero IS NOT NULL AND ejercicio = ? AND proveedor_id IS NOT NULL
    GROUP BY proveedor_id HAVING SUM(total) > 3005.06 ORDER BY total DESC`).all(anio);
  // Gasto por vehículo (base imponible de las líneas de compras asignadas)
  const vehiculos = db.prepare(`SELECT v.id, v.matricula, v.tipo, v.modelo,
      ROUND(SUM(ROUND(l.cantidad * l.precio * (1 - l.dto / 100.0), 2)), 2) AS base, COUNT(DISTINCT d.id) AS documentos
    FROM lineas l JOIN documentos d ON d.id = l.documento_id JOIN vehiculos v ON v.id = l.vehiculo_id
    WHERE d.tipo IN ('factura_compra', 'gasto') AND d.numero IS NOT NULL AND d.ejercicio = ?
    GROUP BY v.id ORDER BY base DESC`).all(anio);
  res.json({ anio, trimestres, m347, m347prov, vehiculos });
});
