// Base de datos SQLite (node:sqlite, sin dependencias externas).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Restauración pendiente (la prepara el plugin de copias de seguridad y se aplica al arrancar, antes de abrir la base
// de datos). Lo que había se guarda en data/antes-de-restaurar-<fecha>/ por si hay que volver atrás.
{
  const dirRest = path.join(DATA_DIR, 'restaurar');
  if (fs.existsSync(path.join(dirRest, 'listo')) && fs.existsSync(path.join(dirRest, 'facturador.db'))) {
    const sello = new Date().toISOString().replace(/[:.]/g, '-');
    const respaldo = path.join(DATA_DIR, `antes-de-restaurar-${sello}`);
    fs.mkdirSync(respaldo, { recursive: true });
    const mover = (origen, destino) => { if (fs.existsSync(origen)) fs.renameSync(origen, destino); };
    for (const f of ['facturador.db', 'facturador.db-wal', 'facturador.db-shm', 'secreto.key', 'adjuntos']) mover(path.join(DATA_DIR, f), path.join(respaldo, f));
    // Datos de los plugins (salvo las propias copias de seguridad, que se conservan)
    const pd = path.join(DATA_DIR, 'plugins-datos');
    if (fs.existsSync(pd)) {
      fs.mkdirSync(path.join(respaldo, 'plugins-datos'), { recursive: true });
      for (const d of fs.readdirSync(pd)) if (d !== 'copias') mover(path.join(pd, d), path.join(respaldo, 'plugins-datos', d));
    }
    for (const f of ['facturador.db', 'secreto.key', 'adjuntos']) mover(path.join(dirRest, f), path.join(DATA_DIR, f));
    if (fs.existsSync(path.join(dirRest, 'plugins-datos'))) {
      fs.mkdirSync(pd, { recursive: true });
      for (const d of fs.readdirSync(path.join(dirRest, 'plugins-datos'))) if (d !== 'copias') mover(path.join(dirRest, 'plugins-datos', d), path.join(pd, d));
    }
    fs.rmSync(dirRest, { recursive: true, force: true });
    console.log(`Copia de seguridad restaurada. Los datos anteriores están en ${respaldo}`);
  }
}

export const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, 'facturador.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios(
  id INTEGER PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('admin','usuario')),
  activo INTEGER NOT NULL DEFAULT 1,
  intentos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER NOT NULL DEFAULT 0,
  ultimo_login TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sesiones(
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ajustes(
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS series(
  codigo TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'normal' CHECK (tipo IN ('normal','rectificativa','simplificada'))
);
CREATE TABLE IF NOT EXISTS formas_pago(
  codigo TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL,
  dias INTEGER NOT NULL DEFAULT 0,
  muestra_iban INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS clientes(
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  nif TEXT NOT NULL DEFAULT '',
  direccion TEXT NOT NULL DEFAULT '',
  cp TEXT NOT NULL DEFAULT '',
  ciudad TEXT NOT NULL DEFAULT '',
  provincia TEXT NOT NULL DEFAULT '',
  pais TEXT NOT NULL DEFAULT 'ES',
  email TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  forma_pago TEXT REFERENCES formas_pago(codigo),
  notas TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS productos(
  id INTEGER PRIMARY KEY,
  referencia TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL,
  precio REAL NOT NULL DEFAULT 0,
  iva REAL NOT NULL DEFAULT 21,
  activo INTEGER NOT NULL DEFAULT 1
);
-- Facturas y presupuestos comparten estructura.
CREATE TABLE IF NOT EXISTS documentos(
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('factura','presupuesto')),
  serie TEXT NOT NULL,
  ejercicio INTEGER NOT NULL,
  numero INTEGER,                 -- se asigna al emitir
  codigo TEXT,                    -- p. ej. A-2026-0001
  fecha TEXT NOT NULL,
  vencimiento TEXT,
  cliente_id INTEGER REFERENCES clientes(id),
  cliente TEXT NOT NULL DEFAULT '{}', -- copia de los datos del cliente al emitir
  estado TEXT NOT NULL DEFAULT 'borrador',
  forma_pago TEXT,
  observaciones TEXT NOT NULL DEFAULT '',
  neto REAL NOT NULL DEFAULT 0,
  total_iva REAL NOT NULL DEFAULT 0,
  total_irpf REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  rectifica_id INTEGER REFERENCES documentos(id),
  motivo TEXT NOT NULL DEFAULT '',
  origen_id INTEGER REFERENCES documentos(id),
  huella TEXT,
  huella_anterior TEXT,
  emitida_en TEXT,
  pagada_en TEXT,
  creado_por INTEGER REFERENCES usuarios(id),
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tipo, serie, ejercicio, numero)
);
CREATE TABLE IF NOT EXISTS lineas(
  id INTEGER PRIMARY KEY,
  documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL DEFAULT 0,
  producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  cantidad REAL NOT NULL DEFAULT 1,
  precio REAL NOT NULL DEFAULT 0,
  dto REAL NOT NULL DEFAULT 0,
  iva REAL NOT NULL DEFAULT 21,
  irpf REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS auditoria(
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  usuario TEXT,
  ip TEXT,
  accion TEXT NOT NULL,
  detalle TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS plugins(
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  manifest TEXT NOT NULL,
  instalado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_doc_tipo_fecha ON documentos(tipo, fecha);
CREATE INDEX IF NOT EXISTS idx_lineas_doc ON lineas(documento_id);
`);

// ---- Migraciones versionadas (PRAGMA user_version) ----
const columnasDe = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const anadirColumna = (t, def) => {
  const nombre = def.split(' ')[0];
  if (!columnasDe(t).includes(nombre)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${def}`);
};

const MIGRACIONES = [
  // 1: niveles de gravedad en la auditoría
  () => anadirColumna('auditoria', "severidad TEXT NOT NULL DEFAULT 'info'"),

  // 2: más tipos de documento, IVA completo, numeración por plantilla, referencia del cliente y adjuntos
  () => {
    // Reconstruye «documentos» sin la restricción CHECK sobre el tipo (los tipos se validan en la aplicación)
    const nuevas = `
      id INTEGER PRIMARY KEY,
      tipo TEXT NOT NULL,
      serie TEXT NOT NULL,
      ejercicio INTEGER NOT NULL,
      numero INTEGER,
      codigo TEXT,
      fecha TEXT NOT NULL,
      vencimiento TEXT,
      cliente_id INTEGER REFERENCES clientes(id),
      cliente TEXT NOT NULL DEFAULT '{}',
      estado TEXT NOT NULL DEFAULT 'borrador',
      forma_pago TEXT,
      referencia TEXT NOT NULL DEFAULT '',
      observaciones TEXT NOT NULL DEFAULT '',
      neto REAL NOT NULL DEFAULT 0,
      total_iva REAL NOT NULL DEFAULT 0,
      total_recargo REAL NOT NULL DEFAULT 0,
      total_irpf REAL NOT NULL DEFAULT 0,
      total_suplidos REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      rectifica_id INTEGER REFERENCES documentos(id),
      motivo TEXT NOT NULL DEFAULT '',
      origen_id INTEGER REFERENCES documentos(id),
      huella TEXT,
      huella_anterior TEXT,
      emitida_en TEXT,
      pagada_en TEXT,
      creado_por INTEGER REFERENCES usuarios(id),
      creado TEXT NOT NULL DEFAULT (datetime('now')),
      actualizado TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (tipo, serie, ejercicio, numero)`;
    const comunes = columnasDe('documentos').join(', ');
    db.exec(`CREATE TABLE documentos_v2(${nuevas});
      INSERT INTO documentos_v2(${comunes}) SELECT ${comunes} FROM documentos;
      DROP TABLE documentos;
      ALTER TABLE documentos_v2 RENAME TO documentos;
      CREATE INDEX IF NOT EXISTS idx_doc_tipo_fecha ON documentos(tipo, fecha);
      CREATE INDEX IF NOT EXISTS idx_doc_cliente ON documentos(cliente_id);`);

    anadirColumna('lineas', "operacion TEXT NOT NULL DEFAULT 'S1'");
    anadirColumna('lineas', 'recargo REAL NOT NULL DEFAULT 0');
    anadirColumna('lineas', 'suplido INTEGER NOT NULL DEFAULT 0');
    anadirColumna('clientes', "operacion TEXT NOT NULL DEFAULT 'S1'");
    anadirColumna('clientes', 'recargo INTEGER NOT NULL DEFAULT 0');
    anadirColumna('series', "formato TEXT NOT NULL DEFAULT '{num}/{año}'");
    db.exec(`UPDATE series SET formato = 'R{num}/{año}' WHERE tipo = 'rectificativa';
      UPDATE series SET formato = 'S{num}/{año}' WHERE tipo = 'simplificada';
      CREATE TABLE IF NOT EXISTS adjuntos(
        id INTEGER PRIMARY KEY,
        entidad TEXT NOT NULL,
        entidad_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        mime TEXT NOT NULL,
        tamano INTEGER NOT NULL,
        archivo TEXT NOT NULL UNIQUE,
        sha256 TEXT NOT NULL,
        subido_por INTEGER REFERENCES usuarios(id),
        creado TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_adjuntos ON adjuntos(entidad, entidad_id);`);
  },

  // 3: recibos (vencimientos) y cobros, con plazos por forma de pago y por cliente
  () => {
    anadirColumna('formas_pago', 'plazos TEXT');          // JSON [{dias, pct}] o NULL = un solo plazo de «dias»
    anadirColumna('clientes', 'plazos TEXT');             // JSON propio del cliente o NULL
    anadirColumna('clientes', "dias_pago TEXT NOT NULL DEFAULT ''"); // p. ej. "10,25"
    anadirColumna('documentos', 'cobrado REAL NOT NULL DEFAULT 0');
    db.exec(`CREATE TABLE IF NOT EXISTS recibos(
        id INTEGER PRIMARY KEY,
        documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
        numero INTEGER NOT NULL,
        importe REAL NOT NULL,
        vencimiento TEXT NOT NULL,
        forma_pago TEXT,
        notas TEXT NOT NULL DEFAULT '',
        UNIQUE (documento_id, numero)
      );
      CREATE TABLE IF NOT EXISTS cobros(
        id INTEGER PRIMARY KEY,
        recibo_id INTEGER NOT NULL REFERENCES recibos(id) ON DELETE CASCADE,
        fecha TEXT NOT NULL,
        importe REAL NOT NULL,
        forma_pago TEXT,
        notas TEXT NOT NULL DEFAULT '',
        usuario_id INTEGER REFERENCES usuarios(id),
        creado TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_recibos_doc ON recibos(documento_id);
      CREATE INDEX IF NOT EXISTS idx_recibos_venc ON recibos(vencimiento);
      CREATE INDEX IF NOT EXISTS idx_cobros_recibo ON cobros(recibo_id);`);
    // Facturas ya emitidas: un recibo por factura y, si estaba cobrada, su cobro
    const docs = db.prepare("SELECT id, fecha, vencimiento, forma_pago, total, estado, pagada_en FROM documentos WHERE tipo = 'factura' AND numero IS NOT NULL").all();
    const insR = db.prepare('INSERT INTO recibos(documento_id, numero, importe, vencimiento, forma_pago) VALUES (?,1,?,?,?)');
    const insC = db.prepare('INSERT INTO cobros(recibo_id, fecha, importe, forma_pago, notas) VALUES (?,?,?,?,?)');
    for (const d of docs) {
      const r = insR.run(d.id, d.total, d.vencimiento || d.fecha, d.forma_pago);
      if (d.estado === 'pagada') {
        insC.run(Number(r.lastInsertRowid), d.pagada_en || d.vencimiento || d.fecha, d.total, d.forma_pago, 'Migrado');
        db.prepare('UPDATE documentos SET cobrado = total WHERE id = ?').run(d.id);
      }
    }
  },

  // 4: pedidos y albaranes: albarán valorado o no, firma del receptor y documentos con varios orígenes
  () => {
    anadirColumna('documentos', 'valorado INTEGER NOT NULL DEFAULT 1');
    anadirColumna('documentos', 'firma_nombre TEXT');
    anadirColumna('documentos', 'firma_dni TEXT');
    anadirColumna('documentos', 'firma_fecha TEXT');
    anadirColumna('documentos', 'firma_adjunto_id INTEGER');
    db.exec(`CREATE TABLE IF NOT EXISTS documentos_origen(
        documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
        origen_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
        PRIMARY KEY (documento_id, origen_id)
      );
      CREATE INDEX IF NOT EXISTS idx_doc_origen ON documentos_origen(origen_id);
      INSERT OR IGNORE INTO documentos_origen(documento_id, origen_id) SELECT id, origen_id FROM documentos WHERE origen_id IS NOT NULL;`);
  },

  // 5: compras (proveedores, facturas recibidas, gastos), vehículos y conductores.
  //    Clientes, proveedores, vehículos y conductores llevan uid + actualizado para poder
  //    sincronizarse en el futuro con Gestor DeCA y eCMR (mismos campos que allí).
  () => {
    db.exec(`CREATE TABLE IF NOT EXISTS proveedores(
        id INTEGER PRIMARY KEY,
        uid TEXT UNIQUE,
        nombre TEXT NOT NULL,
        nif TEXT NOT NULL DEFAULT '',
        direccion TEXT NOT NULL DEFAULT '',
        cp TEXT NOT NULL DEFAULT '',
        ciudad TEXT NOT NULL DEFAULT '',
        provincia TEXT NOT NULL DEFAULT '',
        pais TEXT NOT NULL DEFAULT 'ES',
        email TEXT NOT NULL DEFAULT '',
        telefono TEXT NOT NULL DEFAULT '',
        forma_pago TEXT REFERENCES formas_pago(codigo),
        notas TEXT NOT NULL DEFAULT '',
        operacion TEXT NOT NULL DEFAULT 'S1',
        recargo INTEGER NOT NULL DEFAULT 0,
        plazos TEXT,
        dias_pago TEXT NOT NULL DEFAULT '',
        creado TEXT NOT NULL DEFAULT (datetime('now')),
        actualizado TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS vehiculos(
        id INTEGER PRIMARY KEY,
        uid TEXT UNIQUE,
        matricula TEXT NOT NULL UNIQUE COLLATE NOCASE,
        tipo TEXT NOT NULL DEFAULT 'Tractora',
        modelo TEXT NOT NULL DEFAULT '',
        estado TEXT NOT NULL DEFAULT 'Disponible',
        itv TEXT NOT NULL DEFAULT '',
        notas TEXT NOT NULL DEFAULT '',
        activo INTEGER NOT NULL DEFAULT 1,
        actualizado TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS conductores(
        id INTEGER PRIMARY KEY,
        uid TEXT UNIQUE,
        nombre TEXT NOT NULL,
        dni TEXT NOT NULL UNIQUE COLLATE NOCASE,
        telefono TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        activo INTEGER NOT NULL DEFAULT 1,
        actualizado TEXT NOT NULL DEFAULT (datetime('now'))
      );`);
    anadirColumna('clientes', 'uid TEXT');
    anadirColumna('clientes', 'actualizado TEXT');
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_uid ON clientes(uid)");
    const sinUid = db.prepare('SELECT id FROM clientes WHERE uid IS NULL').all();
    const setUid = db.prepare("UPDATE clientes SET uid = ?, actualizado = COALESCE(actualizado, creado, datetime('now')) WHERE id = ?");
    for (const c of sinUid) setUid.run(crypto.randomUUID(), c.id);

    anadirColumna('documentos', 'proveedor_id INTEGER REFERENCES proveedores(id)');
    anadirColumna('documentos', "numero_proveedor TEXT NOT NULL DEFAULT ''"); // nº de la factura del proveedor
    anadirColumna('documentos', 'deducible INTEGER NOT NULL DEFAULT 1');      // el IVA cuenta como soportado deducible
    anadirColumna('lineas', 'vehiculo_id INTEGER REFERENCES vehiculos(id) ON DELETE SET NULL');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_doc_proveedor ON documentos(proveedor_id);
      CREATE INDEX IF NOT EXISTS idx_lineas_vehiculo ON lineas(vehiculo_id);`);
  },

  // 6: correo: cuenta de cada usuario (Google, Microsoft o SMTP) y registro de envíos
  () => {
    db.exec(`CREATE TABLE IF NOT EXISTS cuentas_correo(
        usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
        proveedor TEXT NOT NULL CHECK (proveedor IN ('google', 'microsoft', 'smtp')),
        email TEXT NOT NULL,
        nombre TEXT NOT NULL DEFAULT '',
        firma TEXT NOT NULL DEFAULT '',
        datos TEXT NOT NULL,          -- JSON cifrado: tokens OAuth o configuración SMTP
        conectado TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS correos_enviados(
        id INTEGER PRIMARY KEY,
        documento_id INTEGER REFERENCES documentos(id) ON DELETE SET NULL,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        desde TEXT NOT NULL,
        proveedor TEXT NOT NULL,
        para TEXT NOT NULL,
        cc TEXT NOT NULL DEFAULT '',
        cco TEXT NOT NULL DEFAULT '',
        asunto TEXT NOT NULL,
        cuerpo TEXT NOT NULL,
        adjuntos TEXT NOT NULL DEFAULT '[]',
        estado TEXT NOT NULL CHECK (estado IN ('enviado', 'error')),
        error TEXT,
        id_mensaje TEXT,
        fecha TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_correos_doc ON correos_enviados(documento_id);`);
  },

  // Teléfono verificado por WhatsApp, códigos de un solo uso y passkeys
  () => {
    anadirColumna('usuarios', "telefono TEXT NOT NULL DEFAULT ''");
    anadirColumna('usuarios', 'telefono_verificado INTEGER NOT NULL DEFAULT 0');
    db.exec(`CREATE TABLE IF NOT EXISTS codigos(
        id INTEGER PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL CHECK (tipo IN ('verificar', 'recuperar')),
        destino TEXT NOT NULL,
        sal TEXT NOT NULL,
        hash TEXT NOT NULL,
        expira INTEGER NOT NULL,
        intentos INTEGER NOT NULL DEFAULT 0,
        usado INTEGER NOT NULL DEFAULT 0,
        creado INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_codigos_usuario ON codigos(usuario_id, tipo);
      CREATE TABLE IF NOT EXISTS passkeys(
        id TEXT PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        clave_publica BLOB NOT NULL,
        contador INTEGER NOT NULL DEFAULT 0,
        transportes TEXT NOT NULL DEFAULT '[]',
        nombre TEXT NOT NULL DEFAULT '',
        sincronizada INTEGER NOT NULL DEFAULT 0,
        creada TEXT NOT NULL DEFAULT (datetime('now')),
        ultimo_uso TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_passkeys_usuario ON passkeys(usuario_id);`);
  },
];

{
  const version = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = version; v < MIGRACIONES.length; v++) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN IMMEDIATE');
    try {
      MIGRACIONES[v]();
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Fallo en la migración ${v + 1}: ${e.message}`);
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
}

// Datos iniciales (solo si las tablas están vacías)
if (!db.prepare('SELECT 1 FROM series LIMIT 1').get()) {
  const s = db.prepare('INSERT INTO series(codigo, descripcion, tipo, formato) VALUES (?,?,?,?)');
  s.run('A', 'General', 'normal', '{num}/{año}');
  s.run('R', 'Rectificativas', 'rectificativa', 'R{num}/{año}');
  s.run('S', 'Simplificadas', 'simplificada', 'S{num}/{año}');
}
if (!db.prepare('SELECT 1 FROM formas_pago LIMIT 1').get()) {
  const f = db.prepare('INSERT INTO formas_pago(codigo, descripcion, dias, muestra_iban) VALUES (?,?,?,?)');
  f.run('CONT', 'Al contado', 0, 0);
  f.run('TRANS', 'Transferencia bancaria', 30, 1);
  f.run('TARJ', 'Tarjeta', 0, 0);
  f.run('BIZUM', 'Bizum', 0, 0);
}

export function getAjuste(clave, defecto = null) {
  const r = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
  return r ? JSON.parse(r.valor) : defecto;
}

export function setAjuste(clave, valor) {
  db.prepare('INSERT INTO ajustes(clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
    .run(clave, JSON.stringify(valor));
}

export function transaccion(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Registra un evento en la auditoría. severidad: 'info' | 'aviso' | 'alerta'. */
export function auditar(req, accion, detalle = '', severidad = 'info') {
  try {
    db.prepare('INSERT INTO auditoria(usuario, ip, accion, detalle, severidad) VALUES (?,?,?,?,?)')
      .run(req?.usuario?.usuario ?? null, req?.ip ?? null, accion, String(detalle).slice(0, 1000), severidad);
  } catch (e) {
    console.error('No se pudo registrar en la auditoría:', e.message);
  }
}
