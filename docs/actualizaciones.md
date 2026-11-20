# Actualizaciones

7Factura busca versiones nuevas en las [Releases de este repositorio](https://github.com/im7manu/7factura/releases) y se actualiza solo, sin riesgo de perder datos.

## Para quien usa la aplicación

- Cada hora se comprueba si hay una versión nueva. El administrador la ve en **Ajustes → Actualizaciones** y con un aviso verde en la barra superior.
- **Instalar ahora** la descarga, la verifica y la aplica. La aplicación se reinicia (unos segundos).
- **Actualización automática**: si la activas, las versiones nuevas se instalan solas en la franja horaria que elijas (por defecto entre las 3:00 y las 5:00).
- El historial muestra cada actualización y si hubo que volver atrás. También queda en Ajustes → Actividad.

Requisito: arrancar 7Factura con `npm start`, con Docker o con el [instalador de Windows](windows.md), que usan el supervisor. Sin supervisor la pantalla avisa de que no se puede instalar.

La versión de Windows usa exactamente el mismo paquete firmado y el mismo supervisor; sus datos están en `%LOCALAPPDATA%\Facturador\data`. Las actualizaciones solo se aplican mientras 7Factura está abierto.

## Cómo se protege una actualización

```
 Aplicación (server/actualizaciones.mjs)          Supervisor (scripts/supervisor.mjs)
 ───────────────────────────────────────          ───────────────────────────────────
 1. Consulta releases/latest en GitHub
 2. Descarga facturador-X.Y.Z.tar.gz + .sig
 3. Verifica la firma Ed25519  ──✗──> rechaza
 4. Verifica el contenido del paquete
 5. Lo extrae en data/actualizaciones/versiones/X.Y.Z
 6. Copia la base de datos (VACUUM INTO)
 7. Escribe pendiente.json y se para  ──────────>  8. Arranca la versión nueva
                                                   9. La vigila durante el periodo de prueba
                                                  10a. Responde bien → versión activa
                                                  10b. Se cae / no responde → vuelve a la
                                                       anterior y restaura la copia de la BD
```

1. **Firma digital.** Cada paquete va acompañado de su firma Ed25519 (`.sig`). La clave pública está en `server/clave-actualizaciones.pem` y viaja con la aplicación; la clave privada solo la tiene el autor. Un paquete modificado o de otra procedencia se rechaza.
2. **Comprobaciones del paquete.** Sin enlaces simbólicos ni rutas fuera de la carpeta; el `package.json` debe ser de `facturador`, con una versión **mayor** que la instalada y una versión de Node compatible con la del servidor; deben estar los archivos esenciales; todo el código del servidor se compila con `node --check`.
3. **Sin tocar nada de lo que funciona.** La versión nueva se extrae en `data/actualizaciones/versiones/X.Y.Z`. El código anterior se queda donde estaba.
4. **Copia de la base de datos** en `data/actualizaciones/copias/` justo antes de aplicar la versión.
5. **Periodo de prueba.** El supervisor arranca la versión nueva y comprueba durante `UPDATE_HEALTH_SECONDS` (60 s) que sigue viva y que responde en `/api/estado`.
6. **Vuelta atrás automática.** Si falla, el supervisor la para, vuelve a la versión anterior y restaura la base de datos desde la copia. La base de datos que dejó la versión fallida se guarda aparte (`facturador-version-fallida-X.Y.Z.db`) para poder estudiarla.
7. **Corte de luz a mitad.** Si el equipo se apaga (o se cierra la ventana de Windows) durante la actualización, al volver a arrancar el supervisor la retoma desde `pendiente.json`. Si el corte llega durante el periodo de prueba (`en-prueba.json`), vuelve a la versión anterior y repite la actualización desde el principio, con su periodo de prueba y su copia de la base de datos.

La carpeta `data/` **nunca se borra**. Se conservan las últimas `UPDATE_KEEP_BACKUPS` (3) copias y versiones.

Todo esto se prueba en `server/test/actualizaciones.test.mjs` con un supervisor real: firma manipulada (rechazada), versión correcta (instalada, datos intactos) y versión que borra clientes y se cae (vuelta atrás con los clientes recuperados).

## Archivos de estado (`data/actualizaciones/`)

| Archivo | Para qué |
|---|---|
| `actual.json` | Versión activa y su carpeta |
| `pendiente.json` | Versión preparada que el supervisor debe aplicar |
| `en-prueba.json` | Versión arrancada que aún está en su periodo de prueba |
| `resultado.json` | Resultado de la última actualización (`ok` o `revertida`) |
| `historial.json` | Últimos 50 eventos |
| `versiones/` | Código de las versiones descargadas |
| `copias/` | Copias de la base de datos previas a cada actualización |

Si la instalación base (por ejemplo, una imagen de Docker reconstruida) es más nueva que la última versión descargada, se usa la instalación base.

## Para el autor: publicar una versión

1. Sube `version` en `package.json` (versionado semántico: `1.0.1` correcciones, `1.1.0` funciones nuevas, `2.0.0` cambios incompatibles) y añade la entrada en `CHANGELOG.md`.
2. Haz commit en `main` y crea la etiqueta:
   ```bash
   git tag v1.0.1
   git push origin main v1.0.1
   ```
3. El workflow [`publicar.yml`](../.github/workflows/publicar.yml) comprueba que la etiqueta coincide con `package.json`, ejecuta las pruebas, genera el paquete con `npm run release` (interfaz compilada + dependencias de producción), lo firma, genera el instalador de Windows con `npm run instalador:windows` y crea la Release con `facturador-1.0.1.tar.gz`, `facturador-1.0.1.tar.gz.sig` y `Facturador-Instalador-Windows.exe` (+ su `.sha256`). El instalador lleva siempre el mismo nombre para que el enlace de descarga del README (`releases/latest/download/…`) apunte siempre a la última versión.

Las instalaciones la verán en menos de una hora. Una Release marcada como *pre-release* o borrador no se ofrece.

### Publicar a mano

```bash
FACTURADOR_CLAVE_FIRMA="$(cat ~/.facturador/clave-firma-actualizaciones.pem)" npm run release
npm run instalador:windows   # necesita go y makensis
gh release create v1.0.1 release/* --title "7Factura 1.0.1" --generate-notes
```

### La clave de firma

- Se generó una sola vez con `node scripts/generar-clave-firma.mjs`, que guarda la privada en `~/.facturador/clave-firma-actualizaciones.pem` y la pública en `server/clave-actualizaciones.pem`.
- En GitHub está como secreto del repositorio `FACTURADOR_CLAVE_FIRMA` (Settings → Secrets and variables → Actions).
- **Nunca** se sube al repositorio.
- **Guárdala en un sitio seguro** (gestor de contraseñas). Si se pierde, las instalaciones existentes rechazarán las versiones firmadas con una clave nueva: habría que publicar una versión puente firmada con la antigua o actualizar cada instalación a mano.
- Si se filtrara: genera una clave nueva y publica cuanto antes una versión firmada con la antigua que ya incluya la pública nueva.

## Variables

| Variable | Por defecto | Descripción |
|---|---|---|
| `UPDATE_DISABLED` | — | `1` desactiva la comprobación y la instalación |
| `UPDATE_REPO` | `im7manu/7factura` | Repositorio de las Releases (por ejemplo, un fork propio) |
| `UPDATE_PUBKEY` | `server/clave-actualizaciones.pem` | Clave pública en PEM (para forks con su propia clave) |
| `UPDATE_HEALTH_SECONDS` | `60` | Duración del periodo de prueba |
| `UPDATE_KEEP_BACKUPS` | `3` | Copias y versiones que se conservan |
