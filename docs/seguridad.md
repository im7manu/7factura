# Seguridad

## Privacidad

7Factura se ejecuta en tu equipo y guarda los datos en `data/`. No envía telemetría ni datos de negocio a nadie. Las únicas conexiones salientes son la comprobación de actualizaciones y de plugins en GitHub, y los correos que el usuario envía desde su propia cuenta (ver el [README](../README.md#tus-datos-en-tu-servidor)).

## Accesos

- **Contraseñas** con scrypt (N=16384, sal aleatoria de 32 bytes) y comparación en tiempo constante. Los hashes antiguos se recalculan con los parámetros actuales al iniciar sesión.
- **Política de contraseñas**: al menos 10 caracteres, con mayúsculas, minúsculas, números y un símbolo.
- **Bloqueo**: 15 minutos tras 5 intentos fallidos en una cuenta, y tras 10 fallos desde la misma dirección IP.
- **Sesiones**: token aleatorio de 256 bits en una cookie `HttpOnly`, `SameSite=Strict` (y `Secure` con HTTPS). En la base de datos solo se guarda su hash. Caducan a las 12 horas.
- **Roles**: administrador (ajustes, usuarios, plugins, actualizaciones) y usuario.

## Passkeys y recuperación por WhatsApp

- **Passkeys (WebAuthn)**: cada usuario puede crear passkeys en **Mi cuenta** y entrar con «Entrar con passkey», sin usuario ni contraseña. La clave privada nunca sale del dispositivo; 7Factura solo guarda la pública. Una cuenta bloqueada por intentos fallidos puede seguir entrando con passkey. El administrador puede quitar las passkeys de un usuario (Ajustes › Usuarios) si pierde el dispositivo. Solo funcionan desde un dominio con HTTPS (o `localhost`): en la versión de escritorio, que usa `127.0.0.1`, no están disponibles.
- **Recuperar la contraseña por WhatsApp**: «¿Has olvidado tu contraseña?» envía un código de 6 cifras al teléfono verificado del usuario. Caduca en 10 minutos, admite 5 intentos, solo se guarda su hash y se limita a un envío por minuto y cinco por hora. La respuesta es la misma exista o no el usuario. Al usarlo se desbloquea la cuenta, se cierran las demás sesiones y se avisa por WhatsApp del cambio.
- **Teléfono verificado**: con WhatsApp configurado, cada usuario verifica su móvil con un código la próxima vez que entra (se puede desactivar en Ajustes › Seguridad).
- **Configuración**: Ajustes › Seguridad, con la dirección de un puente compatible con [whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) (`POST /api/send`). La variable de entorno `WHATSAPP_API` tiene prioridad; `WHATSAPP_EXIGIR=0` no obliga a verificar el teléfono; `RP_ID` y `RP_ORIGIN` fijan el dominio de las passkeys detrás de un proxy.

## Peticiones

- **CSRF**: toda petición que modifica datos debe venir del mismo origen (cabeceras `Origin`/`Referer`), además de la cookie `SameSite=Strict`.
- **Cabeceras**: `Content-Security-Policy` estricta (sin scripts externos), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `X-Frame-Options` y `Strict-Transport-Security` con HTTPS.
- **Validación** de todos los datos de entrada en el servidor (NIF/CIF/NIE, IBAN, importes, fechas, estados permitidos…).
- **Adjuntos**: lista blanca de tipos, tamaño máximo de 15 MB, nombres saneados y sin rutas fuera de la carpeta.

## Integridad de los documentos

- Las facturas emitidas no se pueden modificar ni borrar; la numeración es correlativa y no admite fechas anteriores a la última de la serie.
- Cada factura emitida guarda una **huella SHA-256 encadenada** con la anterior, que permite detectar cualquier alteración posterior.

## Secretos

- Credenciales de correo, tokens OAuth y certificados digitales se cifran con **AES-256-GCM**. La clave está en `data/secreto.key` (permisos `600`) o en la variable `FACTURADOR_SECRET`.
- La interfaz nunca recibe esos secretos, solo si están configurados.

## Código de terceros

- **Plugins**: solo los instala un administrador; cada paquete se verifica con su SHA-256 del registro, se rechazan enlaces simbólicos y rutas peligrosas. Un plugin ejecuta código con los permisos de la aplicación: instala solo plugins de confianza.
- **Actualizaciones**: firmadas con Ed25519 y verificadas antes de instalarse, con vuelta atrás automática ([actualizaciones.md](actualizaciones.md)).

## Registro de actividad

Ajustes → Actividad guarda accesos (correctos y fallidos), bloqueos, emisiones, cambios de ajustes y usuarios, plugins, actualizaciones y restauraciones, con nivel de gravedad (información, aviso, alerta).

## Recomendaciones

- Si se accede desde fuera de la oficina, hazlo por **VPN** o detrás de **HTTPS** ([instalacion.md](instalacion.md#acceso-desde-fuera-de-la-oficina-https)).
- Un usuario por persona, con su propia contraseña. Rol de administrador solo para quien lo necesite.
- Mantén Node.js y el sistema operativo actualizados, y la actualización automática de 7Factura activada.
- Descarga las copias de seguridad y guárdalas fuera del servidor; contienen todos los datos de la empresa.

## Informar de una vulnerabilidad

Mira [SECURITY.md](../SECURITY.md).
