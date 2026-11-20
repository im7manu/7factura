// Facturador: servidor HTTP.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { cargarUsuario } from './auth.mjs';
import { publico, privado } from './routes/basicos.mjs';
import { router as documentos } from './routes/documentos.mjs';
import { router as adjuntos } from './routes/adjuntos.mjs';
import { router as cobros } from './routes/cobros.mjs';
import { router as terceros } from './routes/terceros.mjs';
import { router as correo, routerPublico as correoPublico } from './routes/correo.mjs';
import { router as actualizaciones, programar as programarActualizaciones } from './actualizaciones.mjs';
import { apiPlugins, montarRutasPlugins, montarRutasPublicasPlugins, cargarPlugins, cspDePlugin } from './plugins.mjs';
import { requiereSesion } from './auth.mjs';
import { auditar } from './db.mjs';
import { seguridadPublica, seguridadPrivada, exigirTelefonoVerificado } from './seguridad.mjs';

const PORT = Number(process.env.PORT || 9100);
const HOST = process.env.HOST || '0.0.0.0';
const DIST = path.resolve('dist');

const app = express();
app.disable('x-powered-by');
// Detrás de un proxy (Nginx, Caddy, Cloudflare…) indica TRUST_PROXY=1 para que la IP real llegue a la
// limitación de intentos y a la auditoría. Sin esto, todos comparten la IP del proxy.
const TP = process.env.TRUST_PROXY;
if (TP) app.set('trust proxy', /^\d+$/.test(TP) ? Number(TP) : TP === 'true' ? true : TP);

// Cabeceras de seguridad
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // Las páginas de un plugin (/plugins/<id>/...) pueden declarar orígenes https extra en su plugin.json (p. ej. un mapa)
  const m = req.path.match(/^\/(?:plugins|pub)\/([a-z0-9-]+)\//);
  const x = m ? cspDePlugin(m[1]) : {}, mas = (t) => (x[t]?.length ? ` ${x[t].join(' ')}` : '');
  res.setHeader('Content-Security-Policy',
    `default-src 'self'; img-src 'self' data: blob:${mas('img')}; style-src 'self' 'unsafe-inline'${mas('style')}; script-src 'self'${mas('script')}; font-src 'self' data:${mas('font')}; connect-src 'self'${mas('connect')}; frame-src 'self' blob:${mas('frame')}; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`);
  next();
});

app.use(express.json({ limit: '1mb' }));

// Protección CSRF: las peticiones que modifican datos deben venir del mismo origen.
// Se comprueba Origin y, si el navegador no lo envía, Referer.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const procedencia = req.headers.origin || req.headers.referer;
  if (procedencia) {
    const host = req.host;
    let ok = false;
    try { ok = new URL(procedencia).host === host; } catch { ok = false; }
    if (!ok) {
      auditar(req, 'csrf.bloqueado', `Procedencia no autorizada: ${String(procedencia).slice(0, 200)}`, 'alerta');
      return res.status(403).json({ error: 'Origen no permitido' });
    }
  }
  next();
});

montarRutasPublicasPlugins(app); // páginas públicas de plugins (sin sesión), antes de la comprobación de sesión
app.use(cargarUsuario);
app.use('/api', publico);
app.use('/api', seguridadPublica);
// Mientras el teléfono no esté verificado (y WhatsApp esté configurado) solo se permite verificarlo
app.use('/api', exigirTelefonoVerificado);
app.use('/api', seguridadPrivada);
app.use('/api/plugins', apiPlugins);
app.use('/api/documentos', requiereSesion, documentos);
app.use('/api/adjuntos', requiereSesion, adjuntos);
app.use('/api/cobros', requiereSesion, cobros);
app.use('/api/actualizaciones', requiereSesion, actualizaciones);
app.use('/api/correo', correoPublico);
app.use('/api/correo', requiereSesion, correo);
app.use('/api', requiereSesion, terceros);
app.use('/api', privado);
montarRutasPlugins(app);
app.use('/api', (_req, res) => res.status(404).json({ error: 'No encontrado' }));

// Interfaz compilada (npm run build)
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/|\/plugins\/|\/pub\/).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido' });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

await cargarPlugins();
programarActualizaciones();
app.listen(PORT, HOST, () => console.log(`Facturador escuchando en http://localhost:${PORT}`));
