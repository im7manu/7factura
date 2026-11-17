# Arquitectura y desarrollo

## Tecnologías

| Parte | Tecnología |
|---|---|
| Servidor | Node.js 22.13+, Express 5, `node:sqlite` (SQLite en modo WAL), pdfkit, nodemailer |
| Interfaz | React 18, Vite 5, TypeScript, Tailwind CSS 3, TanStack Query, React Router 6, Radix UI, lucide-react |
| Cálculos fiscales | `shared/fiscal.mjs`: el mismo módulo en el servidor y en la interfaz |
| Pruebas | `node:test`, de extremo a extremo contra un servidor real |

Sin servicios externos: ni base de datos aparte, ni colas, ni CDN. La interfaz compilada (`dist/`) la sirve el propio servidor.

## Estructura

```
server/
  index.mjs              arranque, cabeceras de seguridad, CSRF, montaje de rutas, interfaz estática
  db.mjs                 esquema, migraciones (PRAGMA user_version), ajustes, auditoría, restauración al arrancar
  auth.mjs               contraseñas (scrypt), sesiones, bloqueos, roles
  plugins.mjs            registro, instalación verificada, puntos de extensión y contexto de los plugins
  actualizaciones.mjs    comprobación, verificación e instalación de actualizaciones
  clave-actualizaciones.pem  clave pública Ed25519 de las actualizaciones
  routes/
    basicos.mjs          estado, setup, login, apariencia, ajustes, series, formas de pago, productos,
                         usuarios, auditoría, resumen del inicio, informes
    documentos.mjs       todos los documentos de venta y compra: CRUD, emisión, numeración, huella,
                         conversiones, agrupar, facturar periodo, firma del receptor, PDF
    cobros.mjs           vencimientos (recibos), cobros y pagos, avisos, ajustes de cobros
    terceros.mjs         clientes, proveedores, vehículos, conductores, lista compartida (DeCA)
    adjuntos.mjs         archivos adjuntos a documentos
    correo.mjs           cuentas (OAuth Google/Microsoft y SMTP), plantillas, envío y registro
  lib/
    pdf.mjs              PDF estándar de los documentos
    totales.mjs          re-exporta shared/fiscal.mjs
    nif.mjs              validación de NIF, NIE, CIF e IBAN
    cifrado.mjs          AES-256-GCM para secretos
  test/                  pruebas de extremo a extremo
shared/fiscal.mjs        IVA, recargo, suplidos, IRPF, operaciones (S1, E1…), plantillas de numeración
src/                     interfaz React
  pages/                 una página por pantalla
  components/            AppShell (barra, menú), diálogos (correo, firma, facturar mes…), ui/
  hooks/                 sesión y apariencia (tema)
  lib/                   cliente de la API, utilidades, aplicación del tema
public/                  archivos estáticos (manual en PDF, SDK de plugins)
scripts/
  dev.mjs                servidor + Vite a la vez
  supervisor.mjs         arranque supervisado y aplicación segura de actualizaciones
  crear-release.mjs      paquete firmado de una versión
  crear-instalador-windows.mjs  instalador de Windows (paquete firmado + Node.js + lanzador)
  generar-clave-firma.mjs  par de claves Ed25519 (una sola vez)
  generar-manual.mjs     manual en PDF (con las capturas de docs/manual/capturas)
  empaquetar-plugin.mjs  paquete .tar.gz de un plugin y su entrada del registro
  importar-facturascripts.mjs  migración desde FacturaScripts
examples/plugin-hola/    plugin mínimo de ejemplo
windows/
  lanzador/              Facturador.exe (Go): arranca el supervisor sin consola y abre la ventana
  instalador.nsi         instalador NSIS por usuario
  facturador.ico         icono
```

## Base de datos

Un único archivo SQLite (`data/facturador.db`). El esquema se crea en `db.mjs` y los cambios se aplican con **migraciones numeradas** (`MIGRACIONES`, guardando el número en `PRAGMA user_version`). Cada migración se ejecuta en una transacción. **Nunca cambies una migración ya publicada**: añade una nueva.

Tablas principales:

| Tabla | Contenido |
|---|---|
| `documentos` | Todos los documentos (`tipo`: factura, presupuesto, proforma, pedido, albaran, presupuesto_compra, pedido_compra, albaran_compra, factura_compra, gasto), con totales, estado, número, huella, firma… |
| `lineas` | Líneas de cada documento (impuesto, operación, recargo, suplido, vehículo) |
| `documentos_origen` | De qué documentos procede cada uno (conversiones y agrupaciones) |
| `recibos`, `cobros` | Vencimientos y cobros o pagos |
| `clientes`, `proveedores`, `vehiculos`, `conductores` | Datos maestros (con `uid` y `actualizado` para compartir con Gestor DeCA) |
| `productos`, `series`, `formas_pago` | Catálogo y configuración |
| `usuarios`, `sesiones`, `auditoria` | Accesos y registro de actividad |
| `cuentas_correo`, `correos_enviados` | Correo por usuario y registro de envíos |
| `adjuntos`, `plugins`, `ajustes` | Adjuntos, plugins instalados y ajustes (JSON por clave) |

## Numeración

Los documentos guardan `serie`, `ejercicio` y `numero` (entero). El código visible se compone con la plantilla de la serie, por ejemplo `{num}/{año}` → `31/2026` o `{serie}{año}-{num:4}` → `A2026-0031` (`componerCodigo` en `shared/fiscal.mjs`). La numeración es correlativa por serie y ejercicio y se asigna al emitir, dentro de una transacción.

## API

Todas las rutas están bajo `/api`, devuelven JSON y, salvo las públicas, requieren sesión.

| Prefijo | Rutas |
|---|---|
| `/api` (públicas) | `GET /estado`, `POST /setup`, `POST /login`, `POST /logout`, `GET /apariencia` |
| `/api/documentos` | `GET /?tipo=`, `POST /`, `GET|PUT|DELETE /:id`, `POST /:id/emitir`, `/:id/estado`, `/:id/rectificar`, `/:id/duplicar`, `/:id/convertir`, `/:id/facturar`, `POST /agrupar`, `GET|POST /facturar-periodo`, `POST|DELETE /:id/firma`, `GET /:id/pdf`, `GET|PUT /ajustes-ventas`, `GET|PUT /ajustes-compras` |
| `/api/cobros` | `GET /recibos`, `GET|PUT /documentos/:id/recibos`, `POST /recibos/:id/cobros`, `DELETE /cobros/:id`, `GET /avisos`, `GET|PUT /ajustes` |
| `/api` (terceros) | `/clientes`, `/proveedores`, `/vehiculos`, `/conductores` (CRUD), `GET /compartido/:entidad?desde=` |
| `/api/adjuntos` | Subir, listar, descargar y borrar adjuntos de un documento |
| `/api/correo` | Estado, OAuth, SMTP, aplicaciones, plantillas, borrador, envío y registro por documento |
| `/api/plugins` | Instalados, registro, instalar, subir, activar, desinstalar, estado y reinicio |
| `/api/actualizaciones` | `GET /`, `POST /comprobar`, `POST /instalar`, `PUT /ajustes` |
| `/api` (resto) | `/ajustes`, `/series`, `/formas-pago`, `/productos`, `/usuarios`, `/auditoria`, `/resumen`, `/informes/ejercicio/:anio`, `/utilidades/nif` |
| `/api/p/<plugin>` | Rutas propias de cada plugin |

Las peticiones que modifican datos deben llevar la cabecera `Origin` (o `Referer`) del mismo origen.

## Interfaz y temas

Los colores, radios, sombras y tipografía son variables CSS (`src/index.css`) que Tailwind usa como tokens (`bg-surface`, `text-muted`, `bg-brand`…). Un tema (plugin Temas) solo cambia esas variables y algunos atributos de `<html>` (`data-cristal`, `data-relieve`, `data-densidad`…), así que **usa siempre los tokens** y no colores fijos en los componentes.

## Desarrollo

```bash
npm install
npm run dev          # API en :9100 (con recarga) + Vite en :8080 con proxy a la API
npm test             # pruebas
npm run typecheck    # TypeScript
npm run build        # interfaz en dist/
npm run manual       # manual en PDF
npm run release      # paquete firmado (necesita FACTURADOR_CLAVE_FIRMA)
```

Variables útiles en desarrollo y pruebas: `DATA_DIR` (otra carpeta de datos), `UPDATE_DISABLED=1`, `PLUGINS_REGISTRY` (otro registro de plugins), `PLUGINS_DEV_HTTP=1` (permitir registros `http://`), `CORREO_PRUEBA_DIR` (guardar los correos en una carpeta en lugar de enviarlos).

### Pruebas

`server/test/` arranca servidores reales en carpetas temporales:

- `api.test.mjs`: recorrido completo (setup, seguridad, clientes, todos los documentos, IVA, numeración, cobros, compras, correo, informes…).
- `plugins.test.mjs`: registro, verificación SHA-256, instalación y paquetes maliciosos.
- `actualizaciones.test.mjs`: supervisor, firma, instalación y vuelta atrás.

Las pruebas de los plugins oficiales están en el repositorio `facturador-plugins` y usan este repositorio como aplicación (`../facturador`).
