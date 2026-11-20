# Instalación y puesta en marcha

7Factura se instala en un equipo de la empresa (un servidor, un NAS, un miniPC o el ordenador de la oficina) y se usa desde el navegador de cualquier equipo de la red. Todos los datos se guardan en ese equipo.

> **¿Solo vas a usarlo en tu ordenador con Windows?** Usa el [instalador de Windows](windows.md): no necesitas nada de lo que sigue.

## Requisitos

- **Node.js 22.13 o superior** ([nodejs.org](https://nodejs.org), versión LTS), o **Docker**.
- Unos 200 MB de disco para la aplicación, más los datos (una base de datos SQLite y los adjuntos).
- Que el equipo esté encendido mientras se usa la aplicación.
- Navegador moderno (Chrome, Edge, Firefox o Safari) en los equipos que la usen, también en móviles y tabletas.

No hace falta instalar ninguna base de datos: 7Factura usa SQLite, que viene con Node.js.

## Opción A: Node.js

1. Descarga `facturador-X.Y.Z.tar.gz` de la última [Release](https://github.com/im7manu/7factura/releases/latest) y descomprímelo:
   ```bash
   tar -xzf facturador-1.0.0.tar.gz
   cd facturador
   ```
   El paquete de la Release ya incluye la interfaz compilada y las dependencias.
2. Arranca la aplicación:
   ```bash
   npm start
   ```
3. Abre `http://localhost:9100` (o `http://IP-DEL-SERVIDOR:9100` desde otros equipos).

`npm start` arranca el **supervisor** (`scripts/supervisor.mjs`), que vuelve a arrancar la aplicación si se para y aplica las actualizaciones. Usa siempre `npm start` en producción: con `npm run start:directo` la aplicación funciona, pero no se puede actualizar sola.

### Desde el código fuente

```bash
git clone https://github.com/im7manu/7factura.git
cd facturador
npm install
npm run build
npm start
```

### Arranque automático con el sistema

**Linux (systemd).** Crea `/etc/systemd/system/facturador.service`:

```ini
[Unit]
Description=7Factura
After=network.target

[Service]
WorkingDirectory=/opt/facturador
ExecStart=/usr/bin/npm start
Environment=TZ=Europe/Madrid
Restart=always
User=facturador

[Install]
WantedBy=multi-user.target
```

y actívalo con `sudo systemctl enable --now facturador`.

**Windows.** Si solo se usa en ese ordenador, usa el [instalador de Windows](windows.md). Para usarlo desde otros equipos de la red, lo más sencillo es Docker Desktop (opción B). Sin Docker, puedes crear una tarea en el *Programador de tareas* que ejecute `npm start` en la carpeta de 7Factura «al iniciar el sistema», o registrarlo como servicio con una herramienta como NSSM.

**macOS.** Usa Docker Desktop o un `launchd` agent que ejecute `npm start`.

## Opción B: Docker

```bash
git clone https://github.com/im7manu/7factura.git
cd facturador
docker compose up -d --build
```

El `docker-compose.yml` incluido publica el puerto solo en `127.0.0.1:9100` (para ponerlo detrás de un proxy HTTPS) y guarda los datos en `./data`. Si lo vas a usar solo dentro de la red de la oficina, cambia el puerto a `"9100:9100"`.

La imagen arranca con el supervisor, así que también se actualiza sola. Las versiones descargadas se guardan dentro de `./data`, por lo que sobreviven a reinicios del contenedor.

## Primera configuración

Al abrir 7Factura por primera vez aparece un asistente:

1. **Cuenta de administrador**: nombre, usuario, email y contraseña (al menos 10 caracteres con mayúsculas, minúsculas, números y un símbolo).
2. **Datos de la empresa**: razón social, NIF, dirección, IBAN y texto legal del pie de los documentos.

En la misma pantalla está el enlace al **manual de uso en PDF**. Todo se puede cambiar después en **Ajustes**.

Después conviene:

- Crear los **usuarios** del equipo (Ajustes → Usuarios).
- Revisar las **series** y el formato de numeración (Ajustes → Series y formas de pago).
- Instalar el plugin **Copias de seguridad** (Plugins) y descargar la primera copia.
- Conectar el **correo** de cada usuario (Ajustes → Correo, ver [correo.md](correo.md)).
- Si vienes de FacturaScripts, [importar los datos](importar-facturascripts.md).

## Acceso desde fuera de la oficina (HTTPS)

Dentro de la red local basta con `http://IP-DEL-SERVIDOR:9100`. Para acceder desde fuera, **publícalo siempre con HTTPS**. Algunas opciones:

- **VPN** (la más segura): Tailscale, WireGuard o la VPN del router. La aplicación no queda expuesta a internet.
- **Proxy inverso** con certificado, por ejemplo Caddy:
  ```
  facturas.tuempresa.es {
      reverse_proxy 127.0.0.1:9100
  }
  ```
  En este caso arranca 7Factura con `TRUST_PROXY=1` y `BASE_URL=https://facturas.tuempresa.es`.
- **Túnel** (Cloudflare Tunnel u otro).

`BASE_URL` es necesaria para iniciar sesión con Google o Microsoft en Ajustes → Correo, porque esos servicios devuelven al usuario a esa dirección.

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `9100` | Puerto HTTP |
| `HOST` | todas las interfaces | Dirección en la que escucha (`127.0.0.1` para aceptar solo conexiones locales) |
| `DATA_DIR` | `./data` | Carpeta de datos (base de datos, adjuntos, copias, versiones) |
| `PLUGINS_DIR` | `./plugins` (`data/plugins` con el supervisor) | Carpeta de los plugins instalados |
| `TZ` | la del sistema | Pon `Europe/Madrid` para que las fechas de los documentos sean correctas |
| `TRUST_PROXY` | — | `1` si va detrás de un proxy inverso |
| `BASE_URL` | — | Dirección pública, p. ej. `https://facturas.tuempresa.es` |
| `FACTURADOR_SECRET` | — | Clave para cifrar credenciales. Si no se indica, se crea `data/secreto.key` |
| `UPDATE_DISABLED` | — | `1` desactiva las actualizaciones |
| `UPDATE_REPO` | `im7manu/7factura` | Repositorio del que se descargan las actualizaciones |
| `UPDATE_HEALTH_SECONDS` | `60` | Periodo de prueba de una versión nueva antes de darla por buena |
| `UPDATE_KEEP_BACKUPS` | `3` | Copias previas y versiones antiguas que se conservan |

## La carpeta `data/`

| Ruta | Contenido |
|---|---|
| `facturador.db` (+ `-wal`, `-shm`) | Base de datos: documentos, clientes, cobros, usuarios, ajustes… |
| `secreto.key` | Clave que cifra las credenciales de correo y los certificados |
| `adjuntos/` | Archivos adjuntos y firmas de albaranes |
| `plugins/` | Plugins instalados (con el supervisor) |
| `plugins-datos/` | Datos de cada plugin (temas, diseños, certificado, copias…) |
| `actualizaciones/` | Versiones descargadas, copias previas a cada actualización e historial |
| `antes-de-restaurar-<fecha>/` | Lo que había antes de restaurar una copia |

## Copias de seguridad

Como los datos solo están en tu equipo, **las copias son responsabilidad tuya**.

- **Recomendado**: el plugin [Copias de seguridad](https://github.com/im7manu/7factura-plugins/tree/main/copias) hace una copia automática semanal y bajo demanda, descargable en ZIP. Guarda los ZIP fuera del servidor (disco externo, nube de la empresa…).
- **Manual**: copia la carpeta `data/` entera con la aplicación parada. Incluye siempre `secreto.key`: sin ella las credenciales de correo y el certificado digital guardados no se pueden leer y habría que volver a configurarlos.

Para recuperar el servidor: instala 7Factura en otro equipo, instala el plugin de copias y restaura el último ZIP (o copia la carpeta `data/` antes de arrancar).

## Solución de problemas

| Problema | Solución |
|---|---|
| «Origen no permitido» al guardar | Accede por la misma dirección que usa el navegador; detrás de un proxy, pon `TRUST_PROXY=1` y `BASE_URL` |
| Las fechas salen con un día de diferencia | Arranca con `TZ=Europe/Madrid` |
| `node:sqlite` no existe | Actualiza Node.js a la 22.13 o superior |
| No aparecen actualizaciones | Comprueba que arrancas con `npm start`, Docker o el instalador de Windows y que el servidor tiene salida a internet; mira Ajustes → Actualizaciones |
| He olvidado la contraseña del administrador | Otro administrador puede cambiarla en Ajustes → Usuarios. Si no hay otro, abre una incidencia y te indicamos cómo restablecerla desde la base de datos |
