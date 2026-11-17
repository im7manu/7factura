# Correo

Cada documento emitido tiene **Enviar por correo**: se abre una ventana con el destinatario (el email del cliente o proveedor), el asunto y el texto de la plantilla de ese tipo de documento, y el PDF adjunto. Todo se puede cambiar antes de enviar. Cada envío queda registrado en el documento (a quién, cuándo, quién lo envió y si salió bien).

El correo sale **desde la cuenta de cada usuario**, que la conecta en **Ajustes → Correo**:

| Opción | Para quién | Qué hace falta |
|---|---|---|
| **Google** | Gmail y Google Workspace | Que el administrador registre la aplicación en Google una vez |
| **Microsoft 365** | Outlook.com, Outlook y Exchange de Microsoft 365 | Que el administrador registre la aplicación en Microsoft una vez |
| **SMTP** | Cualquier otro proveedor | Servidor, puerto, usuario y contraseña (o contraseña de aplicación) |

Con Google y Microsoft el mensaje se envía mediante su API (Gmail API o Microsoft Graph) y queda en la carpeta de enviados del usuario.

## Requisito: `BASE_URL`

Google y Microsoft devuelven al usuario a Facturador tras iniciar sesión, así que la aplicación necesita una dirección fija. Arráncala con `BASE_URL`, por ejemplo `BASE_URL=https://facturas.tuempresa.es`. La dirección de redirección que hay que registrar se muestra en Ajustes → Correo:

```
<BASE_URL>/api/correo/oauth/vuelta
```

Google solo admite `https://` o `http://localhost`.

## Registrar la aplicación en Google

1. Entra en [console.cloud.google.com](https://console.cloud.google.com) y crea un proyecto (por ejemplo «Facturador»).
2. En «APIs y servicios → Biblioteca», activa la **Gmail API**.
3. En «Pantalla de consentimiento de OAuth», elige *Interno* si usáis Google Workspace, o *Externo* y añade como usuarios de prueba los correos de tu equipo.
4. En «Credenciales → Crear credenciales → ID de cliente de OAuth», elige *Aplicación web*.
5. En «URI de redireccionamiento autorizados» pega la dirección de redirección.
6. Copia el **ID de cliente** y el **Secreto del cliente** en Ajustes → Correo → Aplicaciones.

Permisos que se piden: `openid email profile` y `gmail.send` (solo enviar; Facturador no puede leer el correo).

## Registrar la aplicación en Microsoft

1. Entra en [entra.microsoft.com](https://entra.microsoft.com) → «Aplicaciones → Registros de aplicaciones → Nuevo registro».
2. Tipos de cuenta: «Cuentas de cualquier directorio y cuentas personales», o solo tu organización.
3. URI de redirección: plataforma *Web*, pega la dirección de redirección.
4. En «Permisos de API», añade de Microsoft Graph (delegados): **Mail.Send**, **User.Read** y **offline_access**.
5. En «Certificados y secretos», crea un **secreto de cliente** y copia su *valor*.
6. Copia el **Id. de aplicación (cliente)** y el secreto en Ajustes → Correo → Aplicaciones. Inquilino: `common`, o el id de tu organización.

## SMTP

Datos habituales:

| Proveedor | Servidor | Puerto | Seguridad |
|---|---|---|---|
| Gmail (con contraseña de aplicación) | `smtp.gmail.com` | 465 | SSL |
| Outlook.com | `smtp-mail.outlook.com` | 587 | STARTTLS |
| IONOS | `smtp.ionos.es` | 587 | STARTTLS |

Con **Probar** se envía un correo de prueba a tu propia dirección.

## Plantillas

En Ajustes → Correo → Plantillas se edita el asunto y el texto de cada tipo de documento (factura, presupuesto, proforma, pedido, albarán…). Variables disponibles:

`{cliente}`, `{tipo}`, `{numero}`, `{fecha}`, `{total}`, `{vencimiento}`, `{referencia}`, `{empresa}`, `{usuario}`.

## Seguridad

- Los tokens de Google y Microsoft, las contraseñas SMTP y los secretos de las aplicaciones se guardan **cifrados** (AES-256-GCM, con `data/secreto.key` o `FACTURADOR_SECRET`) y nunca se devuelven a la interfaz.
- El inicio de sesión usa OAuth 2.0 con PKCE y un parámetro `state` de un solo uso.
- Límite de 30 envíos por usuario cada 10 minutos, para evitar envíos masivos por error.
