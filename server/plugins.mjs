// Sistema de plugins.
//
// Un plugin es una carpeta en plugins/<id>/ con un plugin.json:
// {
//   "id": "mi-plugin", "nombre": "Mi plugin", "version": "1.0.0", "descripcion": "...",
//   "app_min": "0.1.0",
//   "server": "server.mjs",                 // opcional: export function register(ctx)
//   "ui": { "entrada": "ui/index.html",     // opcional: página propia servida en /plugins/<id>/
//           "menu": [{ "titulo": "Mi plugin", "icono": "puzzle" }] }
// }
//
// Los plugins se descargan del registro (un registry.json en GitHub) y se verifican con SHA-256.
// IMPORTANTE: un plugin ejecuta código con los mismos permisos que la aplicación.
// Instala solo plugins de fuentes en las que confíes (por defecto, el registro del autor).
import { Router } from 'express';
import express from 'express';
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { db, getAjuste, setAjuste, auditar, DATA_DIR } from './db.mjs';
import { requiereAdmin, requiereSesion } from './auth.mjs';
import PDFDocument from 'pdfkit';
import { cifrar, descifrar } from './lib/cifrado.mjs';
import { calcularTotales, baseLinea, OPERACIONES, r2, componerCodigo } from './lib/totales.mjs';

const exec = promisify(execFile);
// En Windows se usa el tar.exe del sistema (el de Git u otros no entiende rutas como C:\...)
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
// Rutas peligrosas dentro de un paquete: absolutas, con unidad (C:), con \ o que suben de carpeta
const rutaPeligrosa = (e) => e.startsWith('/') || /^[a-z]:/i.test(e) || e.includes('\\') || e.split('/').includes('..');
export const PLUGINS_DIR = process.env.PLUGINS_DIR || path.resolve('plugins');
export const REGISTRO_DEFECTO = 'https://raw.githubusercontent.com/im7manu/facturador-plugins/main/registry.json';
fs.mkdirSync(PLUGINS_DIR, { recursive: true });

export const hooks = new EventEmitter();
const routers = new Map(); // id -> Router montado bajo /api/p/<id>

// ---- Puntos de extensión ----
// Un plugin puede registrar funciones en estos puntos con ctx.extender(punto, fn):
//   'pdf.generar'      (params) => PDFDocument | null   Dibuja el PDF de un documento (null = usar el diseño estándar)
//   'pdf.postprocesar' async (buffer, doc) => Buffer    Modifica el PDF ya generado (p. ej. firmarlo digitalmente)
//   'apariencia'       () => { tema, fondos }           Tema visual de la aplicación y fotos de inicio de sesión
//   'copias'           { exportar(), ... }              Información para la pantalla «Acerca de» (opcional)
const extensiones = new Map(); // punto -> Map(pluginId -> fn)
const temporizadores = new Map(); // pluginId -> [intervalos]
// Node guarda en caché los módulos importados: si un plugin ya se cargó en este proceso y se actualiza,
// su código nuevo no se usa entero hasta reiniciar la aplicación.
const cargadosEnProceso = new Set();
let reinicioPendiente = false;
export function extensionesDe(punto) {
  return [...(extensiones.get(punto)?.entries() || [])].sort((a, b) => a[0].localeCompare(b[0])).map(([id, fn]) => ({ id, fn }));
}
function desactivar(id) {
  routers.delete(id);
  for (const m of extensiones.values()) m.delete(id);
  for (const t of temporizadores.get(id) || []) clearInterval(t);
  temporizadores.delete(id);
}
const ID_VALIDO = /^[a-z0-9][a-z0-9-]{1,40}$/;
// Solo para desarrollo y pruebas: permite registros y descargas por http (nunca en producción)
const URL_PERMITIDA = process.env.PLUGINS_DEV_HTTP === '1' ? /^https?:\/\// : /^https:\/\//;

function leerManifest(dir) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
  if (!ID_VALIDO.test(m.id || '')) throw new Error('plugin.json: id no válido');
  if (!m.nombre || !m.version) throw new Error('plugin.json: faltan nombre o version');
  for (const rel of [m.server, m.ui?.entrada].filter(Boolean)) {
    const abs = path.resolve(dir, rel);
    if (!abs.startsWith(dir + path.sep)) throw new Error('plugin.json: ruta fuera del plugin');
  }
  return m;
}

async function activar(id) {
  const dir = path.join(PLUGINS_DIR, id);
  const m = leerManifest(dir);
  desactivar(id);
  if (m.server) {
    const router = Router();
    const datos = path.join(DATA_DIR, 'plugins-datos', id); // carpeta propia del plugin, se conserva al actualizarlo
    fs.mkdirSync(datos, { recursive: true });
    const ctx = {
      router, db, hooks, getAjuste, setAjuste, auditar, requiereAdmin, manifest: m, dir,
      dataDir: datos, dataRoot: DATA_DIR, express,
      // Librerías del núcleo disponibles para los plugins (sin tener que instalarlas)
      lib: { PDFDocument, calcularTotales, baseLinea, OPERACIONES, r2, componerCodigo },
      cifrar, descifrar,
      // Datos de un documento listos para dibujar su PDF (carga diferida para evitar dependencias circulares)
      async parametrosPdf(idDoc, opciones) { return (await import('./routes/documentos.mjs')).parametrosPdf(idDoc, opciones); },
      extender(punto, fn) {
        if (!extensiones.has(punto)) extensiones.set(punto, new Map());
        extensiones.get(punto).set(id, fn);
      },
      // Tarea periódica que se detiene sola al desactivar el plugin
      cada(ms, fn) {
        const t = setInterval(() => { Promise.resolve().then(fn).catch((e) => console.error(`[${id}]`, e)); }, ms);
        t.unref();
        temporizadores.set(id, [...(temporizadores.get(id) || []), t]);
        return t;
      },
      // Reinicia la aplicación (necesita Docker con restart o un supervisor que la vuelva a arrancar)
      reiniciar() { setTimeout(() => process.exit(0), 500); },
    };
    const mod = await import(`${pathToFileURL(path.join(dir, m.server)).href}?v=${Date.now()}`);
    if (typeof mod.register === 'function') await mod.register(ctx);
    routers.set(id, router);
    cargadosEnProceso.add(id);
  }
  return m;
}

export async function cargarPlugins() {
  for (const p of db.prepare('SELECT id FROM plugins WHERE activo = 1').all()) {
    try {
      await activar(p.id);
      console.log(`Plugin cargado: ${p.id}`);
    } catch (e) {
      console.error(`No se pudo cargar el plugin ${p.id}:`, e.message);
    }
  }
}

async function obtenerRegistro() {
  const url = process.env.PLUGINS_REGISTRY || getAjuste('registro_plugins', null) || REGISTRO_DEFECTO;
  if (!URL_PERMITIDA.test(url)) throw new Error('El registro de plugins debe ser una URL https');
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`No se pudo leer el registro de plugins (${r.status})`);
  const datos = await r.json();
  return { url, plugins: Array.isArray(datos.plugins) ? datos.plugins : [] };
}

async function instalarDesdeRegistro(id) {
  const { plugins } = await obtenerRegistro();
  const p = plugins.find((x) => x.id === id);
  if (!p) throw new Error('El plugin no está en el registro');
  if (!URL_PERMITIDA.test(p.url || '') || !/^[a-f0-9]{64}$/i.test(p.sha256 || '')) throw new Error('Entrada del registro incompleta (url https y sha256 obligatorios)');

  const r = await fetch(p.url, { signal: AbortSignal.timeout(60_000), redirect: 'follow' });
  if (!r.ok) throw new Error(`Descarga fallida (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 40 * 1024 * 1024) throw new Error('El plugin es demasiado grande');
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (hash.toLowerCase() !== p.sha256.toLowerCase()) throw new Error('La firma SHA-256 no coincide: descarga rechazada');
  return instalarPaquete(buf, id);
}

/** Instala un paquete .tar.gz ya descargado o subido. Si se indica idEsperado, el plugin debe tener ese id. */
async function instalarPaquete(buf, idEsperado = null) {

  const staging = fs.mkdtempSync(path.join(PLUGINS_DIR, '.tmp-'));
  try {
    const archivo = path.join(staging, 'plugin.tar.gz');
    fs.writeFileSync(archivo, buf);
    const extraido = path.join(staging, 'x');
    fs.mkdirSync(extraido);
    // Lista el contenido antes de extraer para rechazar rutas peligrosas
    const { stdout } = await exec(TAR, ['-tzf', archivo]);
    for (const entrada of stdout.split('\n').filter(Boolean)) {
      if (rutaPeligrosa(entrada)) throw new Error('El paquete contiene rutas no permitidas');
    }
    await exec(TAR, ['-xzf', archivo, '-C', extraido, '--no-same-owner', '--no-same-permissions']);
    // Rechaza enlaces simbólicos
    const revisar = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isSymbolicLink()) throw new Error('El paquete contiene enlaces simbólicos');
        if (e.isDirectory()) revisar(path.join(d, e.name));
      }
    };
    revisar(extraido);
    // Admite paquetes con una carpeta raíz (formato de GitHub) o sin ella
    let raiz = extraido;
    const hijos = fs.readdirSync(extraido);
    if (!fs.existsSync(path.join(raiz, 'plugin.json')) && hijos.length === 1) raiz = path.join(extraido, hijos[0]);
    const m = leerManifest(raiz);
    if (idEsperado && m.id !== idEsperado) throw new Error('El id del paquete no coincide con el registro');
    const id = m.id;
    if (cargadosEnProceso.has(id)) reinicioPendiente = true;
    const destino = path.join(PLUGINS_DIR, id);
    fs.rmSync(destino, { recursive: true, force: true });
    fs.renameSync(raiz, destino);
    db.prepare(`INSERT INTO plugins(id, version, activo, manifest) VALUES (?,?,1,?)
      ON CONFLICT(id) DO UPDATE SET version = excluded.version, manifest = excluded.manifest, activo = 1, instalado = datetime('now')`)
      .run(id, m.version, JSON.stringify(m));
    await activar(id);
    return m;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function instalados() {
  return db.prepare('SELECT * FROM plugins ORDER BY id').all().map((p) => ({ ...p, activo: !!p.activo, manifest: JSON.parse(p.manifest) }));
}

// ---- API ----
export const apiPlugins = Router();
apiPlugins.use(requiereSesion);

// Lista para el menú (cualquier usuario)
apiPlugins.get('/menu', (_req, res) => {
  res.json(instalados().filter((p) => p.activo && p.manifest.ui?.entrada).map((p) => ({
    id: p.id, nombre: p.manifest.nombre, entrada: p.manifest.ui.entrada, menu: p.manifest.ui.menu || [{ titulo: p.manifest.nombre }],
  })));
});

apiPlugins.get('/', requiereAdmin, (_req, res) => res.json(instalados()));
apiPlugins.get('/estado', requiereAdmin, (_req, res) => res.json({ reinicio_pendiente: reinicioPendiente }));
// Reinicia la aplicación (necesita Docker con «restart» o un supervisor que la vuelva a arrancar)
apiPlugins.post('/reiniciar', requiereAdmin, (req, res) => {
  auditar(req, 'app.reiniciar', 'desde la página de plugins', 'aviso');
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 500);
});

apiPlugins.get('/registro', requiereAdmin, async (_req, res) => {
  try {
    res.json(await obtenerRegistro());
  } catch (e) {
    res.status(502).json({ error: e.message, url: getAjuste('registro_plugins', null) || REGISTRO_DEFECTO });
  }
});

apiPlugins.post('/:id/instalar', requiereAdmin, async (req, res) => {
  const id = String(req.params.id);
  if (!ID_VALIDO.test(id)) return res.status(400).json({ error: 'Id no válido' });
  try {
    const m = await instalarDesdeRegistro(id);
    auditar(req, 'plugin.instalar', `${id} ${m.version}`, 'aviso');
    res.json({ ok: true, manifest: m, reinicio_pendiente: reinicioPendiente });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Instalar subiendo el archivo .tar.gz (para probar plugins propios o instalar sin conexión)
apiPlugins.post('/subir', requiereAdmin, express.raw({ type: () => true, limit: 40 * 1024 * 1024 }), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length < 20 || req.body[0] !== 0x1f || req.body[1] !== 0x8b) throw new Error('Sube un paquete .tar.gz de plugin');
    const m = await instalarPaquete(req.body);
    auditar(req, 'plugin.subir', `${m.id} ${m.version} (archivo, sha256 ${crypto.createHash('sha256').update(req.body).digest('hex').slice(0, 16)}…)`, 'alerta');
    res.json({ ok: true, manifest: m, reinicio_pendiente: reinicioPendiente });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

apiPlugins.post('/:id/activo', requiereAdmin, async (req, res) => {
  const id = String(req.params.id);
  const p = db.prepare('SELECT 1 FROM plugins WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'No instalado' });
  const activo = !!req.body.activo;
  try {
    if (activo) await activar(id); else desactivar(id);
    db.prepare('UPDATE plugins SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id);
    auditar(req, activo ? 'plugin.activar' : 'plugin.desactivar', id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

apiPlugins.delete('/:id', requiereAdmin, (req, res) => {
  const id = String(req.params.id);
  if (!ID_VALIDO.test(id)) return res.status(400).json({ error: 'Id no válido' });
  desactivar(id);
  db.prepare('DELETE FROM plugins WHERE id = ?').run(id);
  fs.rmSync(path.join(PLUGINS_DIR, id), { recursive: true, force: true });
  auditar(req, 'plugin.desinstalar', id, 'aviso');
  res.json({ ok: true, aviso: 'Reinicia la aplicación para descargar por completo el código del plugin.' });
});

// Rutas de API de cada plugin: /api/p/<id>/...
export function montarRutasPlugins(app) {
  app.use('/api/p/:pluginId', requiereSesion, (req, res, next) => {
    const r = routers.get(req.params.pluginId);
    if (!r) return res.status(404).json({ error: 'Plugin no disponible' });
    r(req, res, next);
  });
  // Interfaz de cada plugin (estática): /plugins/<id>/...
  app.use('/plugins/:pluginId', requiereSesion, (req, res, next) => {
    const id = req.params.pluginId;
    if (!ID_VALIDO.test(id) || !routers.has(id) && !db.prepare('SELECT 1 FROM plugins WHERE id = ? AND activo = 1').get(id)) {
      return res.status(404).end();
    }
    express.static(path.join(PLUGINS_DIR, id), { dotfiles: 'deny', index: false })(req, res, next);
  });
}
