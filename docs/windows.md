# Facturador para Windows (un solo ordenador)

Para autónomos que quieren usar Facturador en **su propio ordenador con Windows**, sin servidor en casa ni en la empresa. Es la misma aplicación que la versión de servidor, con todas sus opciones: ventas, compras, cobros, IVA, informes, correo, plugins y actualizaciones automáticas.

## Instalar

1. Descarga **[Facturador-Instalador-Windows.exe](https://github.com/im7manu/facturador/releases/latest/download/Facturador-Instalador-Windows.exe)** (desde la última [Release](https://github.com/im7manu/facturador/releases/latest)).
2. Ábrelo. **No pide permisos de administrador.**
   - Windows puede mostrar «Windows protegió su PC» porque el instalador no está firmado con un certificado de empresa. Pulsa **Más información → Ejecutar de todas formas**.
3. Al terminar, abre **Facturador** desde el escritorio o el menú Inicio. La primera vez, un asistente te pide crear tu usuario y los datos de tu empresa.

Requisitos: Windows 10 u 11 de 64 bits. No hace falta instalar nada más: el instalador ya trae todo lo necesario, Node.js incluido.

## Cómo funciona

- Al abrir el acceso directo, Facturador arranca en segundo plano y se abre en **una ventana propia** (Microsoft Edge en modo aplicación, sin barra de direcciones). Si Edge no está, usa Google Chrome; si tampoco, tu navegador predeterminado.
- Al **cerrar la ventana**, Facturador se para. Si se estaba aplicando una actualización justo entonces, espera a que termine.
- Solo se puede acceder **desde ese ordenador** (escucha en `127.0.0.1`), no desde otros equipos de la red. Si más adelante necesitas usarlo desde varios equipos, pasa a la [versión de servidor](instalacion.md) y restaura en ella una copia de seguridad.
- Abrirlo dos veces abre otra ventana del mismo Facturador.

## Dónde están tus datos

| Carpeta | Qué hay |
|---|---|
| `%LOCALAPPDATA%\Programs\Facturador` | El programa. Se sustituye entero al reinstalar |
| `%LOCALAPPDATA%\Facturador\data` | **Tus datos**: base de datos, adjuntos, plugins, copias previas a cada actualización… (la misma carpeta `data/` de la [versión de servidor](instalacion.md#la-carpeta-data)) |
| `%LOCALAPPDATA%\Facturador\navegador` | Perfil de la ventana de Facturador (tu sesión iniciada) |
| `%LOCALAPPDATA%\Facturador\registro.log` | Registro del servidor, útil si algo falla |
| `%LOCALAPPDATA%\Facturador\puerto.txt` | Puerto local, 9100 salvo que otro programa lo esté usando |

Para ir a esa carpeta, escribe `%LOCALAPPDATA%\Facturador` en la barra de direcciones del Explorador de archivos.

**Copias de seguridad:** como todo está en un solo ordenador, instala el plugin **Copias de seguridad** (Ajustes → Plugins) y guarda los ZIP fuera del equipo: un disco externo, un pendrive o tu nube.

## Actualizaciones

Exactamente igual que en la versión de servidor ([detalles](actualizaciones.md)): Facturador comprueba cada hora si hay una versión nueva en las Releases de GitHub, verifica su firma digital y la instala con una copia previa de la base de datos y vuelta atrás automática si algo falla. Lo ves en **Ajustes → Actualizaciones**.

- Las actualizaciones automáticas (en la franja que elijas) solo se aplican **mientras Facturador está abierto**. Si nunca coincide, usa **Instalar ahora** o activa una franja en la que sueles trabajar.
- El instalador también sirve para actualizar: puedes descargar el último y ejecutarlo encima. Tus datos no se tocan.
- La versión de Node.js incluida se renueva al reinstalar. Si alguna vez una versión nueva necesitara un Node.js más reciente, Ajustes → Actualizaciones lo indicará: descarga e instala el último instalador.

## Desinstalar

Desde **Configuración → Aplicaciones → Facturador → Desinstalar** (o `Desinstalar.exe` en la carpeta del programa). Al final te pregunta si quieres borrar también tus datos; **por defecto se conservan**, y vuelven a aparecer si instalas Facturador de nuevo.

## Solución de problemas

| Problema | Solución |
|---|---|
| «Windows protegió su PC» al instalar | Más información → Ejecutar de todas formas |
| «Facturador no ha podido arrancar» | Mira el final de `%LOCALAPPDATA%\Facturador\registro.log`. Si un antivirus ha bloqueado `node.exe`, añade una excepción para `%LOCALAPPDATA%\Programs\Facturador` |
| Se abre en el navegador normal en vez de en una ventana propia | No se ha encontrado Edge ni Chrome. Funciona igual: deja abierto el aviso de Facturador mientras lo uses |
| Quiero pasar mis datos a otro ordenador | Haz una copia con el plugin de copias y restáurala en el otro, o copia la carpeta `%LOCALAPPDATA%\Facturador\data` con Facturador cerrado |

## Para el autor: cómo se genera el instalador

El workflow [`publicar.yml`](../.github/workflows/publicar.yml) lo genera en cada versión y lo sube a la Release junto al paquete firmado. Para generarlo a mano (en macOS o Linux):

```bash
brew install go makensis          # o en Debian/Ubuntu: apt install golang nsis
npm run release                   # crea release/facturador-X.Y.Z.tar.gz (firmado)
npm run instalador:windows        # crea release/Facturador-Instalador-Windows.exe
```

Qué lleva dentro:

- `app\`: el mismo `facturador-X.Y.Z.tar.gz` firmado de la Release, sin cambios.
- `node\node.exe`: Node.js LTS para Windows (versión en `scripts/crear-instalador-windows.mjs`), descargado de nodejs.org y verificado con su suma SHA-256 oficial.
- `Facturador.exe`: el lanzador ([`windows/lanzador`](../windows/lanzador/main.go), en Go). Arranca `scripts/supervisor.mjs` sin consola con `DATA_DIR=%LOCALAPPDATA%\Facturador\data` y `HOST=127.0.0.1`, abre la ventana y, al cerrarla, para el servidor. Usa un objeto de trabajo de Windows para que el servidor no se quede nunca huérfano.
- El instalador se hace con NSIS ([`windows/instalador.nsi`](../windows/instalador.nsi)).
