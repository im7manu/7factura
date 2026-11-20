# Plugins

Los plugins amplían Facturador sin tocar su código. Se publican en GitHub y se instalan desde **Plugins** en la aplicación (solo administradores).

## Cómo funciona

1. La aplicación lee un **registro**: un `registry.json` público. Por defecto es
   `https://raw.githubusercontent.com/im7manu/facturador-plugins/main/registry.json`, y se puede cambiar en la página Plugins.
2. Al pulsar **Instalar**, descarga el paquete `.tar.gz` de la URL indicada y **comprueba su SHA-256**. Si no coincide, lo rechaza.
3. Extrae el paquete en `plugins/<id>/` (rechaza rutas peligrosas y enlaces simbólicos), lee `plugin.json` y lo activa sin reiniciar.

> Un plugin ejecuta código en el servidor con los mismos permisos que la aplicación. Publica y usa solo plugins en los que confíes.

## Estructura de un plugin

```
mi-plugin/
  plugin.json
  server.mjs        (opcional) lógica de servidor
  ui/index.html     (opcional) página propia que aparece en el menú
```

### plugin.json

```json
{
  "id": "mi-plugin",
  "nombre": "Mi plugin",
  "version": "1.0.0",
  "descripcion": "Qué hace",
  "autor": "im7manu",
  "app_min": "0.1.0",
  "server": "server.mjs",
  "ui": { "entrada": "ui/index.html", "menu": [{ "titulo": "Mi plugin" }] },
  "csp": { "img": ["https://tile.openstreetmap.org"] }
}
```

- `id`: minúsculas, números y guiones. Debe coincidir con el del registro.
- `publico` (opcional, desde la 1.3.0): carpeta del plugin servida **sin sesión** en `/pub/<id>/` (p. ej. la página para que un cliente acepte un presupuesto).
- `app_min`: versión mínima de Facturador. Si la instalación es más antigua, el plugin no se instala (desde la 1.3.0).
- `csp` (opcional, desde la 1.3.0): orígenes `https://` extra que necesitan las páginas del plugin, por tipo (`img`, `script`, `connect`, `style`, `font`, `frame`). Se añaden a la política de seguridad de contenidos **solo** en `/plugins/<id>/...`, no en el resto de la aplicación. Admite comodín de subdominio (`https://*.gstatic.com`).

### server.mjs

```js
export function register(ctx) {
  // ctx.router se monta en /api/p/<id>/ y solo responde a usuarios con sesión
  ctx.router.get('/hola', (req, res) => res.json({ hola: req.usuario.nombre }));

  // Ganchos disponibles: 'documento.emitido'
  ctx.hooks.on('documento.emitido', (doc) => { /* ... */ });
}
```

### El contexto `ctx`

| Propiedad | Para qué |
|---|---|
| `router` | Router de Express montado en `/api/p/<id>/` (solo usuarios con sesión; usa `ctx.requiereAdmin` para rutas de administrador) |
| `db` | Base de datos (`DatabaseSync` de `node:sqlite`) |
| `getAjuste(clave, def)` / `setAjuste(clave, valor)` | Ajustes en JSON. Usa claves con el prefijo `plugin_<id>` |
| `auditar(req, accion, detalle, severidad)` | Anotar en el registro de actividad (`info`, `aviso`, `alerta`) |
| `requiereAdmin` | Middleware que exige rol de administrador |
| `dataDir` | Carpeta propia en `data/plugins-datos/<id>/`; se conserva al actualizar o desinstalar el plugin |
| `dataRoot` | Carpeta `data/` completa (por ejemplo, para copias de seguridad) |
| `cifrar(texto)` / `descifrar(texto)` | Guardar secretos cifrados con la clave de la instalación |
| `cada(ms, fn)` | Tarea periódica que se detiene sola al desactivar el plugin |
| `extender(punto, fn)` | Registrarse en un punto de extensión (ver abajo) |
| `app` | Funciones del núcleo (asíncronas): `cargarDocumento(id)`, `pdfDocumento(id, opciones)`, `crearBorrador(body, usuarioId)`, `enviarCorreo(usuarioId, { para, asunto, texto, adjuntos, documentoId })`, `recibos(id)`, `registrarCobro(reciboId, { fecha, importe, notas }, usuarioId)`, `borrarCobro(id)`. Aplican las mismas validaciones que la API |
| `routerPublico` | Router **sin sesión** en `/api/pub/<id>/` (60 peticiones por minuto e IP). Úsalo solo para lo imprescindible y valida todo |
| `alParar(fn)` | Función que se ejecuta al desactivar o actualizar el plugin (cerrar conexiones…) |
| `extensionesDe(punto)` | Lista `[{ id, fn }]` de lo registrado en un punto, para usar funciones de otros plugins (desde la 1.3.0) |
| `parametrosPdf(idDoc, opciones)` | Datos de un documento listos para dibujar su PDF |
| `lib` | Librerías del núcleo: `PDFDocument` (pdfkit), `calcularTotales`, `baseLinea`, `OPERACIONES`, `r2`, `componerCodigo` |
| `express` | Express, por ejemplo para `express.raw()` al subir archivos |
| `hooks` | Eventos: `documento.emitido` |
| `reiniciar()` | Reinicia la aplicación (la vuelve a arrancar el supervisor o Docker) |
| `manifest`, `dir` | `plugin.json` leído y carpeta del plugin |

### Puntos de extensión

| Punto | Firma | Lo usa |
|---|---|---|
| `pdf.generar` | `(params) => PDFDocument \| null` | Dibujar el PDF de un documento. `null` = usar el diseño estándar |
| `pdf.postprocesar` | `async (buffer, doc) => Buffer` | Modificar el PDF generado (por ejemplo, firmarlo digitalmente) |
| `apariencia` | `() => ({ tema, fondos })` | Tema visual y fotos de la pantalla de inicio de sesión |
| `direcciones` | `{ sugerir(texto) }` → `[{ etiqueta, calle, cp, ciudad, provincia, lat, lon }]` | Sugerencias en los campos de dirección (clientes, proveedores, empresa) |
| `documento.acciones` | `(doc, { evento, usuario }) => [{ titulo, ruta, proponer? }]` | Botones en un documento. `ruta` es una página del plugin que se abre en una ventana con `?documento=<id>`. Con `evento === 'emitido'` y `proponer: true`, se abre sola al emitir |
| `avisos` | `() => [{ titulo, detalle, enlace }]` | Avisos en la campana (`enlace`: ruta interna, p. ej. `/p/mi-plugin`) |
| `pdf.dibujar` | `(pdf, params, lugar) => y` | Dibuja al final del cuerpo del PDF, antes del pie. `lugar.reservar(alto)` pasa de página si no cabe y devuelve la `y` donde empezar |
| `documento.validarEmision` | `(doc) => motivo \| null` | Impide emitir un borrador con un motivo (p. ej. falta de existencias) |
| `rutas` | `{ calcular(textos, opciones), configurado() }` | Rutas y km (lo ofrece el plugin `rutas`; lo usa `gestor-deca` con `ctx.extensionesDe('rutas')`) |

Si varios plugins usan el mismo punto se aplican por orden de id.

### Dependencias

Un plugin puede llevar su propia carpeta `node_modules` dentro del paquete (como `diseno-pdf`). Usa lo que ya ofrece `ctx.lib` siempre que puedas.

Al desactivar un plugin se quitan sus rutas al momento. Los ganchos (`hooks.on`) y el código cargado desaparecen del todo al reiniciar la aplicación.

### Interfaz (ui/)

La página se muestra dentro de la aplicación (en un iframe) y se sirve desde `/plugins/<id>/`. Puede llamar a su API con `fetch('/api/p/<id>/...')`, que usa la sesión del usuario.

Para que se vea igual que la aplicación y respete el tema activo, incluye el SDK:

```html
<link rel="stylesheet" href="/plugin-sdk.css">
<script src="/plugin-sdk.js"></script>
```

Dentro de la ventana de una acción de documento: `Facturador.parametro('documento')` da el id, `Facturador.cerrar()` cierra la ventana y `Facturador.actualizar()` recarga el documento. La política de seguridad no permite scripts en línea: pon el código en archivos `.js`.

`plugin-sdk.css` aplica los colores y la tipografía del tema con clases sencillas (`.fx-card`, `.fx-btn`, `.fx-btn-primario`, `.fx-btn-peligro`, `.fx-input`, `.fx-campo`, `.fx-tabla`, `.fx-aviso`…), y `plugin-sdk.js` ofrece `Facturador.api(...)` para llamar a la API con la sesión, `Facturador.aviso(texto)` para mostrar avisos y `Facturador.escapar(texto)` para insertar texto en HTML sin riesgo.

### Actualizar un plugin en uso

Node.js guarda en caché el código ya cargado. Si actualizas un plugin que estaba activo, la página Plugins pide **reiniciar la aplicación** para que se use entera la versión nueva.

## Publicar un plugin

1. Empaquétalo:
   ```bash
   node scripts/empaquetar-plugin.mjs examples/plugin-hola \
     https://github.com/im7manu/facturador-plugins/releases/download/hola-v1.0.0/hola-1.0.0.tar.gz
   ```
   El script crea `hola-1.0.0.tar.gz` y muestra la entrada para el registro, con su SHA-256.
2. Sube el `.tar.gz` a una *Release* de GitHub.
3. Añade la entrada a `registry.json` en el repositorio del registro:

```json
{
  "plugins": [
    {
      "id": "hola",
      "nombre": "Hola mundo",
      "version": "1.0.0",
      "descripcion": "Plugin de ejemplo",
      "autor": "im7manu",
      "url": "https://github.com/im7manu/facturador-plugins/releases/download/hola-v1.0.0/hola-1.0.0.tar.gz",
      "sha256": "…",
      "repo": "https://github.com/im7manu/facturador-plugins"
    }
  ]
}
```

Para publicar una actualización, sube la nueva versión y cambia `version`, `url` y `sha256`. La página Plugins ofrecerá **Actualizar**.

## Plugins oficiales

En [im7manu/facturador-plugins](https://github.com/im7manu/facturador-plugins): `copias` (copias de seguridad), `temas`, `diseno-pdf`, `gestor-deca` (facturar envíos de Gestor DeCA) y `rutas` (mapas y km). Son buenos ejemplos de cada punto de extensión.

## Ideas de plugins

- **verifactu**: registro de facturación con el formato de la AEAT, QR y envío.
- **gestor-deca**: integración con Gestor DeCA y eCMR.
- **contabilidad**: asientos automáticos y plan de cuentas.
