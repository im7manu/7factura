# Cambios

## 1.3.0 — 2026-11-20

- **Plugins con mapas**: un plugin puede declarar en `plugin.json` (`"csp"`) orígenes https extra para sus páginas, por ejemplo las teselas de OpenStreetMap o Google Maps. Solo se permiten en las páginas de ese plugin.
- **Plugins que colaboran**: `ctx.extensionesDe(punto)` permite a un plugin usar las funciones que ofrece otro (por ejemplo, `gestor-deca` usa las rutas del plugin `rutas` para facturar por kilómetro).
- `app_min` de `plugin.json` ya se comprueba: un plugin que necesita una versión más nueva de Facturador no se instala y lo explica.
- Nuevos plugins oficiales: **Rutas y mapas** (OpenRouteService gratis o Google Maps con tu clave) y **Gestor DeCA 1.1.0** con cobro **por kilómetro** (solo ida, ida y vuelta o desde la base; precio por cliente, mínimo por viaje y km editables antes de facturar).

## 1.2.0 — 2026-11-19

- **Passkeys**: «Entrar con passkey» sin usuario ni contraseña; tras entrar con contraseña, Facturador propone crear una. Se gestionan en la nueva página **Mi cuenta** (menú de usuario).
- **Recuperar la contraseña por WhatsApp**: código al teléfono verificado; desbloquea la cuenta, cierra las demás sesiones y avisa del cambio.
- **Teléfono verificado obligatorio** al entrar cuando WhatsApp está configurado.
- **Mi cuenta**: passkeys, teléfono y cambio de la propia contraseña.
- **Ajustes › Seguridad**: dirección del puente de WhatsApp, obligar o no a verificar el teléfono y mensaje de prueba.
- **Ajustes › Usuarios**: teléfono y verificación, passkeys, cuentas bloqueadas y desbloqueo al guardar. Cambiar la contraseña desde aquí también desbloquea la cuenta.

## 1.1.1 — 2026-11-17

- **Ayuda integrada**: nueva página **Ayuda** (menú General y menú de usuario) con las 66 preguntas del centro de ayuda de la web y el mismo buscador, que entiende la duda aunque no se usen las mismas palabras. Funciona sin conexión.
- **Ayuda contextual**: el botón **?** de la barra superior (o la tecla **F1**) abre un panel con las preguntas de la pantalla en la que estás, con buscador, sin salir de ella.
- Las preguntas y el buscador están en `shared/ayuda/` y los comparten la aplicación y la web: una pregunta nueva aparece en los dos sitios.

## 1.1.0 — 2026-11-17

- **Instalador para Windows** (`Facturador-Instalador-Windows.exe`) para autónomos que usan un solo ordenador: sin servidor ni permisos de administrador, con Node.js incluido, ventana propia y las mismas opciones y actualizaciones automáticas que la versión de servidor. Ver [docs/windows.md](docs/windows.md).
- Actualizaciones: si el periodo de prueba de una versión nueva se corta (apagado, contenedor parado), al volver a arrancar se repite desde el principio con vuelta atrás si falla.
- Actualizaciones y plugins: en Windows se usa el `tar.exe` del sistema y se rechazan rutas con unidad o `\` dentro de los paquetes.

## 1.0.0 — 2026-11-17

Primera versión publicada.

- Ventas: facturas, rectificativas, simplificadas, presupuestos, proformas, pedidos y albaranes (valorados o no, con firma del receptor), conversiones, agrupar y «Facturar el mes».
- IVA completo: tipos, exentas, exportación, intracomunitarias, inversión del sujeto pasivo, recargo de equivalencia, suplidos e IRPF.
- Numeración configurable por serie (p. ej. `31/2026`) y huella de integridad encadenada.
- Cobros y pagos con plazos, días de pago, cobros parciales y avisos.
- Compras: facturas de proveedor, gastos y tickets, IVA deducible, pedidos y albaranes de proveedor, gasto por vehículo.
- Clientes, proveedores, productos, vehículos y conductores (compatibles con Gestor DeCA).
- Correo integrado por usuario (Google, Microsoft 365, SMTP) con plantillas y registro.
- Informes: modelo 303, 347 de clientes y proveedores, gasto por vehículo.
- Plugins desde GitHub con verificación SHA-256.
- Actualizaciones automáticas firmadas con vuelta atrás automática.
- Importación desde FacturaScripts.
- Manual de uso en PDF.
