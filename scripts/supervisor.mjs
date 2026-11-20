#!/usr/bin/env node
// Supervisor de 7Factura: arranca la aplicación, la vuelve a arrancar si se para (reinicios, restauraciones)
// y aplica las actualizaciones de forma segura:
//   1. La aplicación descarga y verifica la versión nueva, hace una copia de la base de datos y deja
//      data/actualizaciones/pendiente.json. Después se para.
//   2. El supervisor arranca la versión nueva y la vigila durante un periodo de prueba (UPDATE_HEALTH_SECONDS).
//   3. Si se cae o no responde, vuelve a la versión anterior y restaura la base de datos de la copia.
// Los datos (carpeta data/) nunca se borran. El código de cada versión se guarda en data/actualizaciones/versiones/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INCLUIDO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // código que trae la instalación o la imagen
const DATA = path.resolve(process.env.DATA_DIR || path.join(INCLUIDO, 'data'));
const DIR = path.join(DATA, 'actualizaciones');
const ACTUAL = path.join(DIR, 'actual.json');
const PENDIENTE = path.join(DIR, 'pendiente.json');
const RESULTADO = path.join(DIR, 'resultado.json');
const HISTORIAL = path.join(DIR, 'historial.json');
const EN_PRUEBA = path.join(DIR, 'en-prueba.json'); // actualización arrancada que aún no ha superado el periodo de prueba
const PRUEBA_S = Number(process.env.UPDATE_HEALTH_SECONDS || 60);
const PUERTO = Number(process.env.PORT || 9100);
fs.mkdirSync(DIR, { recursive: true });

const leer = (f, def = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
const escribir = (f, v) => { fs.writeFileSync(`${f}.tmp`, JSON.stringify(v, null, 2)); fs.renameSync(`${f}.tmp`, f); };
const log = (...a) => console.log(new Date().toISOString(), '[supervisor]', ...a);
const versionDe = (dir) => leer(path.join(dir, 'package.json'), {})?.version || '0.0.0';
const comparar = (a, b) => {
  const pa = String(a).split('.').map(Number); const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
function anotar(evento) {
  const h = leer(HISTORIAL, []);
  h.unshift({ fecha: new Date().toISOString(), ...evento });
  escribir(HISTORIAL, h.slice(0, 50));
}

/** Código que hay que ejecutar: la última versión instalada, salvo que la instalación base sea más nueva. */
function codigoActual() {
  const a = leer(ACTUAL);
  if (a?.dir && fs.existsSync(path.join(a.dir, 'server', 'index.mjs')) && comparar(versionDe(a.dir), versionDe(INCLUIDO)) >= 0) return a.dir;
  return INCLUIDO;
}

let hijo = null;
let parando = false;
const salidas = [];

function arrancar(dir) {
  log(`Arrancando 7Factura ${versionDe(dir)} desde ${dir}`);
  const p = spawn(process.execPath, ['server/index.mjs'], {
    cwd: dir,
    env: { ...process.env, DATA_DIR: DATA, FACTURADOR_SUPERVISADO: '1', FACTURADOR_CODIGO: dir, PLUGINS_DIR: process.env.PLUGINS_DIR || path.join(DATA, 'plugins') },
    stdio: 'inherit',
  });
  hijo = p;
  return p;
}

/** Espera a que la aplicación responda y siga viva durante el periodo de prueba. */
async function superaPrueba(p) {
  const fin = Date.now() + PRUEBA_S * 1000;
  let respondio = false;
  let vivo = true;
  p.once('exit', () => { vivo = false; });
  while (Date.now() < fin && vivo) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/api/estado`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) respondio = true;
    } catch { /* aún arrancando */ }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  return vivo && respondio;
}

async function aplicarActualizacion(pend) {
  const anterior = codigoActual();
  const desde = versionDe(anterior);
  log(`Aplicando la actualización ${desde} → ${pend.version}`);
  escribir(EN_PRUEBA, { ...pend, anterior });
  escribir(ACTUAL, { version: pend.version, dir: pend.dir, anterior });
  fs.rmSync(PENDIENTE, { force: true });
  const p = arrancar(pend.dir);
  if (await superaPrueba(p)) {
    fs.rmSync(EN_PRUEBA, { force: true });
    log(`Actualización a ${pend.version} correcta`);
    escribir(RESULTADO, { estado: 'ok', desde, hasta: pend.version, fecha: new Date().toISOString() });
    anotar({ evento: 'actualizada', desde, hasta: pend.version });
    vigilar(p);
    return;
  }
  // Ha fallado: vuelta atrás al código y a la base de datos de antes
  log(`La versión ${pend.version} no ha superado el periodo de prueba. Volviendo a ${desde}…`);
  await pararHijo(p);
  escribir(ACTUAL, anterior === INCLUIDO ? {} : { version: desde, dir: anterior });
  if (pend.copia && fs.existsSync(path.join(pend.copia, 'facturador.db'))) {
    const fallida = path.join(pend.copia, `facturador-version-fallida-${pend.version}.db`);
    for (const ext of ['', '-wal', '-shm']) {
      const f = path.join(DATA, `facturador.db${ext}`);
      if (fs.existsSync(f)) fs.renameSync(f, ext ? `${fallida}${ext}` : fallida);
    }
    fs.copyFileSync(path.join(pend.copia, 'facturador.db'), path.join(DATA, 'facturador.db'));
    log('Base de datos restaurada desde la copia previa a la actualización');
  }
  fs.rmSync(EN_PRUEBA, { force: true });
  escribir(RESULTADO, { estado: 'revertida', desde, hasta: pend.version, fecha: new Date().toISOString(),
    mensaje: `La versión ${pend.version} no arrancó bien y se ha vuelto automáticamente a la ${desde}. No se ha perdido ningún dato.` });
  anotar({ evento: 'revertida', desde, hasta: pend.version });
  vigilar(arrancar(anterior));
}

function pararHijo(p) {
  return new Promise((ok) => {
    if (!p || p.exitCode !== null) return ok();
    p.once('exit', ok);
    p.kill('SIGTERM');
    setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* ya parado */ } }, 8000).unref();
  });
}

function vigilar(p) {
  p.once('exit', async (codigo, senal) => {
    if (parando) return;
    const pend = leer(PENDIENTE);
    if (pend?.dir && fs.existsSync(path.join(pend.dir, 'server', 'index.mjs'))) return aplicarActualizacion(pend);
    // Rearranque normal (reinicio pedido, restauración de copia…). Si se cae en bucle, espera más entre intentos.
    const ahora = Date.now();
    salidas.push(ahora);
    while (salidas.length && ahora - salidas[0] > 120_000) salidas.shift();
    const espera = salidas.length > 5 ? 30_000 : 1000;
    log(`La aplicación se ha parado (código ${codigo ?? senal}). Rearrancando en ${espera / 1000} s…`);
    setTimeout(() => vigilar(arrancar(codigoActual())), espera);
  });
}

for (const s of ['SIGTERM', 'SIGINT']) {
  process.on(s, async () => {
    parando = true;
    await pararHijo(hijo);
    process.exit(0);
  });
}

// Si se cortó el periodo de prueba (apagado, contenedor o ventana cerrados), se vuelve a la versión anterior y la
// actualización se repite desde el principio, con su copia de la base de datos.
const enPrueba = leer(EN_PRUEBA);
if (enPrueba?.dir && enPrueba.anterior) {
  log(`El periodo de prueba de la versión ${enPrueba.version} se interrumpió: se repite`);
  escribir(ACTUAL, enPrueba.anterior === INCLUIDO ? {} : { version: versionDe(enPrueba.anterior), dir: enPrueba.anterior });
  const { anterior: _a, ...pend } = enPrueba;
  escribir(PENDIENTE, pend);
  fs.rmSync(EN_PRUEBA, { force: true });
}
// Si quedó una actualización a medias (corte de luz, contenedor parado…), se aplica ahora
const pendiente = leer(PENDIENTE);
if (pendiente?.dir && fs.existsSync(path.join(pendiente.dir, 'server', 'index.mjs'))) aplicarActualizacion(pendiente);
else vigilar(arrancar(codigoActual()));
