# Cambios

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
