// Actualizaciones automáticas desde las Releases de GitHub.
// Seguridad: cada paquete se publica firmado (Ed25519) con la clave privada del autor; la aplicación solo
// acepta paquetes cuya firma cuadre con la clave pública incluida (server/clave-actualizaciones.pem).
// Instalación: verifica, prepara la versión en data/actualizaciones/versiones/, copia la base de datos y deja
// que el supervisor (scripts/supervisor.mjs) la arranque con periodo de prueba y vuelta atrás automática.
import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, getAjuste, setAjuste, auditar } from './db.mjs';
import { requiereAdmin } from './auth.mjs';

const exec = promisify(execFile);
// En Windows se usa el tar.exe del sistema (el de Git u otros no entiende rutas como C:\...)
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
// Rutas peligrosas dentro de un paquete: absolutas, con unidad (C:), con \ o que suben de carpeta
const rutaPeligrosa = (e) => e.startsWith('/') || /^[a-z]:/i.test(e) || e.includes('\\') || e.split('/').includes('..');
const CODIGO = path.resolve(process.env.FACTURADOR_CODIGO || '.');
const DIR = path.join(DATA_DIR, 'actualizaciones');
const VERSIONES = path.join(DIR, 'versiones');
const COPIAS = path.join(DIR, 'copias');
fs.mkdirSync(VERSIONES, { recursive: true });
fs.mkdirSync(COPIAS, { recursive: true });

const REPO = process.env.UPDATE_REPO || 'im7manu/facturador';
const API = (process.env.UPDATE_API || 'https://api.github.com').replace(/\/$/, '');
const DESACTIVADAS = process.env.UPDATE_DISABLED === '1';
const CONSERVAR = Math.max(1, Number(process.env.UPDATE_KEEP_BACKUPS || 3));
export const SUPERVISADO = process.env.FACTURADOR_SUPERVISADO === '1';

const leerJson = (f, def = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
export const VERSION = leerJson(path.join(CODIGO, 'package.json'), {})?.version || '0.0.0';

function clavePublica() {
  const pem = process.env.UPDATE_PUBKEY || (() => {
    try { return fs.readFileSync(path.resolve(CODIGO, 'server', 'clave-actualizaciones.pem'), 'utf8'); } catch { return null; }
  })();
  return pem ? crypto.createPublicKey(pem) : null;
}

/** Compara versiones x.y.z: >0 si a es más nueva. */
export function compararVersiones(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

const DEFECTO = { auto: false, hora_inicio: 3, hora_fin: 5 };
const ajustes = () => ({ ...DEFECTO, ...getAjuste('actualizaciones', {}) });
let estado = { ultima_comprobacion: null, disponible: null, error: null, instalando: false };

/** Consulta la última Release publicada (no borradores ni pre-releases). */
export async function comprobar() {
  if (DESACTIVADAS) return estado;
  try {
    const r = await fetch(`${API}/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'facturador-actualizador' }, signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 404) { estado = { ...estado, ultima_comprobacion: new Date().toISOString(), disponible: null, error: null }; return estado; }
    if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
    const rel = await r.json();
    const version = String(rel.tag_name || '').replace(/^v/, '');
    const paquete = (rel.assets || []).find((a) => a.name === `facturador-${version}.tar.gz`);
    const firma = (rel.assets || []).find((a) => a.name === `facturador-${version}.tar.gz.sig`);
    const nueva = !rel.draft && !rel.prerelease && /^\d+\.\d+\.\d+$/.test(version) && compararVersiones(version, VERSION) > 0 && paquete && firma;
    estado = {
      ...estado, ultima_comprobacion: new Date().toISOString(), error: null,
      disponible: nueva ? { version, notas: String(rel.body || '').slice(0, 20_000), publicada: rel.published_at, paquete: paquete.browser_download_url, firma: firma.browser_download_url, tamano: paquete.size } : null,
    };
  } catch (e) {
    estado = { ...estado, ultima_comprobacion: new Date().toISOString(), error: `No se pudo comprobar: ${e.message}` };
  }
  return estado;
}

async function descargar(url, max) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'facturador-actualizador' }, signal: AbortSignal.timeout(300_000) });
  if (!r.ok) throw new Error(`Descarga fallida (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > max) throw new Error('El paquete es demasiado grande');
  return buf;
}

/**
 * Paquetes de node_modules (en la raíz) que necesitan unas dependencias de producción, recorriendo el árbol entero:
 * si una dependencia está anidada dentro de su paquete se sigue desde ahí; si no, se busca en la raíz.
 */
function dependenciasProduccion(raiz, nombres) {
  const vistas = new Set();
  const visitar = (dirPaquete, deps) => {
    for (const n of deps) {
      const anidada = path.join(dirPaquete, 'node_modules', n);
      if (dirPaquete !== raiz && fs.existsSync(anidada)) { visitar(anidada, depsDe(anidada)); continue; }
      if (vistas.has(n)) continue;
      const dir = path.join(raiz, 'node_modules', n);
      if (!fs.existsSync(dir)) continue;
      vistas.add(n);
      visitar(dir, depsDe(dir));
    }
  };
  const depsDe = (dir) => {
    const pk = leerJson(path.join(dir, 'package.json'), {});
    return Object.keys({ ...(pk.dependencies || {}), ...(pk.optionalDependencies || {}), ...(pk.peerDependencies || {}) });
  };
  visitar(raiz, nombres);
  return vistas;
}

/** Comprueba, extrae y prepara una versión. Devuelve la carpeta lista para arrancar. */
async function preparar(paquete, firma, version) {
  const clave = clavePublica();
  if (!clave) throw new Error('Esta instalación no tiene la clave pública para verificar actualizaciones');
  if (!crypto.verify(null, paquete, clave, Buffer.from(firma.toString('utf8').trim(), 'base64'))) {
    throw new Error('La firma digital del paquete no es válida: actualización rechazada');
  }
  const destino = path.join(VERSIONES, `${version}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(destino, { recursive: true });
  try {
    const tgz = path.join(destino, '..', `${path.basename(destino)}.tar.gz`);
    fs.writeFileSync(tgz, paquete);
    const { stdout } = await exec(TAR, ['-tzf', tgz], { maxBuffer: 64 * 1024 * 1024 });
    for (const e of stdout.split('\n').filter(Boolean)) {
      if (rutaPeligrosa(e)) throw new Error('El paquete contiene rutas no permitidas');
    }
    await exec(TAR, ['-xzf', tgz, '-C', destino, '--no-same-owner'], { maxBuffer: 64 * 1024 * 1024 });
    fs.rmSync(tgz, { force: true });
    // Admite paquetes con carpeta raíz
    let raiz = destino;
    const hijos = fs.readdirSync(destino);
    if (!fs.existsSync(path.join(destino, 'package.json')) && hijos.length === 1) raiz = path.join(destino, hijos[0]);
    const revisar = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isSymbolicLink() && !d.includes(`${path.sep}node_modules${path.sep}.bin`) && !d.endsWith(`${path.sep}.bin`)) throw new Error(`El paquete contiene enlaces simbólicos (${e.name})`);
        if (e.isDirectory()) revisar(path.join(d, e.name));
      }
    };
    revisar(raiz);
    const pk = leerJson(path.join(raiz, 'package.json'), {});
    if (pk.name !== 'facturador') throw new Error('El paquete no es 7Factura');
    if (pk.version !== version) throw new Error(`La versión del paquete (${pk.version}) no coincide con la publicada (${version})`);
    const minNode = String(pk.engines?.node || '').match(/(\d+)\.(\d+)/);
    if (minNode && compararVersiones(process.versions.node, `${minNode[1]}.${minNode[2]}.0`) < 0) throw new Error(`La versión nueva necesita Node ${minNode[1]}.${minNode[2]} o superior`);
    for (const f of ['server/index.mjs', 'scripts/supervisor.mjs', 'dist/index.html']) {
      if (!fs.existsSync(path.join(raiz, f))) throw new Error(`Al paquete le falta ${f}`);
    }
    // Comprueba que el código no tiene errores de sintaxis
    const archivos = [];
    const recorrer = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) recorrer(p); else if (/\.m?js$/.test(e.name)) archivos.push(p); } };
    for (const d of ['server', 'shared', 'scripts']) if (fs.existsSync(path.join(raiz, d))) recorrer(path.join(raiz, d));
    for (const f of archivos) {
      try { await exec(process.execPath, ['--check', f]); } catch (e) { throw new Error(`Error de sintaxis en ${path.relative(raiz, f)}`); }
    }
    // Dependencias: las trae el paquete o, si son las mismas que las actuales, se copian las de producción
    if (!fs.existsSync(path.join(raiz, 'node_modules', 'express'))) {
      const actual = leerJson(path.join(CODIGO, 'package.json'), {});
      if (JSON.stringify(actual.dependencies || {}) !== JSON.stringify(pk.dependencies || {})) throw new Error('El paquete no trae sus dependencias y son distintas de las actuales');
      for (const n of dependenciasProduccion(CODIGO, Object.keys(pk.dependencies || {}))) {
        fs.cpSync(path.join(CODIGO, 'node_modules', n), path.join(raiz, 'node_modules', n), { recursive: true, dereference: true });
      }
    }
    return raiz;
  } catch (e) {
    fs.rmSync(destino, { recursive: true, force: true });
    throw e;
  }
}

/** Copia de la base de datos y de la clave de cifrado antes de actualizar. */
function copiaPrevia(hasta) {
  const dir = path.join(COPIAS, `${new Date().toISOString().replace(/[:.]/g, '-')}-${VERSION}-a-${hasta}`);
  fs.mkdirSync(dir, { recursive: true });
  db.exec(`VACUUM INTO '${path.join(dir, 'facturador.db').replace(/'/g, "''")}'`);
  const secreto = path.join(DATA_DIR, 'secreto.key');
  if (fs.existsSync(secreto)) fs.copyFileSync(secreto, path.join(dir, 'secreto.key'));
  // Conserva solo las últimas copias y versiones
  const viejas = fs.readdirSync(COPIAS).sort().reverse().slice(CONSERVAR);
  for (const v of viejas) fs.rmSync(path.join(COPIAS, v), { recursive: true, force: true });
  return dir;
}

function limpiarVersiones(enUso) {
  const dirs = fs.readdirSync(VERSIONES).map((d) => path.join(VERSIONES, d)).filter((d) => fs.statSync(d).isDirectory())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const d of dirs.slice(CONSERVAR + 1)) if (!enUso.some((u) => u.startsWith(d))) fs.rmSync(d, { recursive: true, force: true });
}

/** Instala la versión disponible. La aplicación se para y el supervisor arranca la nueva. */
export async function instalar(quien = 'sistema') {
  if (!SUPERVISADO) throw new Error('La aplicación no se está ejecutando con el supervisor (npm start), así que no puede actualizarse sola');
  if (estado.instalando) throw new Error('Ya hay una actualización en curso');
  if (!estado.disponible) await comprobar();
  const d = estado.disponible;
  if (!d) throw new Error('No hay ninguna versión nueva');
  estado.instalando = true;
  try {
    const [paquete, firma] = await Promise.all([descargar(d.paquete, 200 * 1024 * 1024), descargar(d.firma, 10_000)]);
    const dir = await preparar(paquete, firma, d.version);
    const copia = copiaPrevia(d.version);
    limpiarVersiones([dir, CODIGO]);
    fs.writeFileSync(path.join(DIR, 'pendiente.json'), JSON.stringify({ version: d.version, dir, copia, desde: VERSION, fecha: new Date().toISOString() }));
    auditar({ usuario: { usuario: quien } }, 'actualizacion.instalar', `${VERSION} → ${d.version}`, 'alerta');
    console.log(`Actualización a ${d.version} preparada. Reiniciando…`);
    setTimeout(() => process.exit(0), 300);
    return { version: d.version };
  } catch (e) {
    estado.instalando = false;
    estado.error = e.message;
    auditar({ usuario: { usuario: quien } }, 'actualizacion.error', e.message, 'alerta');
    throw e;
  }
}

/** Resultado de la última actualización aplicada por el supervisor (se muestra una vez y queda en el historial). */
function resultadoReciente() {
  const r = leerJson(path.join(DIR, 'resultado.json'));
  if (r && !r.registrado) {
    auditar({ usuario: { usuario: 'sistema' } }, r.estado === 'ok' ? 'actualizacion.ok' : 'actualizacion.revertida', `${r.desde} → ${r.hasta}`, r.estado === 'ok' ? 'info' : 'alerta');
    fs.writeFileSync(path.join(DIR, 'resultado.json'), JSON.stringify({ ...r, registrado: true }));
  }
  return r;
}

/** Programa la comprobación horaria y la instalación automática en la franja elegida. */
export function programar() {
  resultadoReciente();
  if (DESACTIVADAS) return;
  const tarea = async () => {
    await comprobar();
    const a = ajustes();
    const h = new Date().getHours();
    const enFranja = a.hora_inicio <= a.hora_fin ? h >= a.hora_inicio && h < a.hora_fin : h >= a.hora_inicio || h < a.hora_fin;
    if (a.auto && enFranja && estado.disponible && SUPERVISADO && !estado.instalando) {
      try { await instalar('actualizacion-automatica'); } catch (e) { console.error('Actualización automática fallida:', e.message); }
    }
  };
  setTimeout(tarea, 20_000).unref();
  setInterval(tarea, 60 * 60 * 1000).unref();
}

// ---- API (administradores) ----
export const router = Router();
router.use(requiereAdmin);
router.get('/', (_req, res) => {
  res.json({
    version: VERSION, repo: REPO, supervisado: SUPERVISADO, desactivadas: DESACTIVADAS, firma_configurada: !!clavePublica(),
    ...estado, ajustes: ajustes(), resultado: leerJson(path.join(DIR, 'resultado.json')), historial: leerJson(path.join(DIR, 'historial.json'), []),
  });
});
router.post('/comprobar', async (_req, res) => res.json(await comprobar()));
router.post('/instalar', async (req, res) => {
  try { res.json({ ok: true, ...(await instalar(req.usuario.usuario)) }); } catch (e) { res.status(409).json({ error: e.message }); }
});
router.put('/ajustes', (req, res) => {
  const a = {
    auto: !!req.body.auto,
    hora_inicio: Math.max(0, Math.min(23, Math.round(Number(req.body.hora_inicio) || 0))),
    hora_fin: Math.max(0, Math.min(23, Math.round(Number(req.body.hora_fin) || 0))),
  };
  setAjuste('actualizaciones', a);
  auditar(req, 'actualizacion.ajustes', JSON.stringify(a), 'aviso');
  res.json(a);
});
