# Importar desde FacturaScripts

`scripts/importar-facturascripts.mjs` lee una copia SQL de FacturaScripts (volcado de MySQL/MariaDB) y la carga en una instalación nueva de Facturador.

## Qué se importa

- Formas de pago.
- Clientes, con su dirección de facturación.
- Productos.
- Facturas de cliente, con sus líneas, IVA, recargo de equivalencia, suplidos, retenciones, vencimientos, cobros y rectificativas.
- Presupuestos.
- Con `--empresa`, también los datos de la empresa.

Las facturas **conservan su número original** (por ejemplo `29/2026`). Las importadas no llevan huella de integridad: la cadena empieza con la primera factura emitida en Facturador.

## Pasos

1. Haz una copia de la base de datos de FacturaScripts:
   ```bash
   mysqldump -u USUARIO -p NOMBRE_BD > facturascripts.sql
   # con Docker:
   docker exec CONTENEDOR_MYSQL mysqldump -u USUARIO -pCONTRASEÑA NOMBRE_BD > facturascripts.sql
   ```
2. Instala Facturador y completa la **primera configuración** (o deja solo el administrador). El script se niega a importar si ya hay clientes o documentos.
3. Para la aplicación y ejecuta, en la carpeta de Facturador:
   ```bash
   node scripts/importar-facturascripts.mjs facturascripts.sql --empresa
   # con otra carpeta de datos:
   node scripts/importar-facturascripts.mjs facturascripts.sql --db /ruta/data/facturador.db
   ```
4. Arranca la aplicación y comprueba los totales en Informes: deben coincidir con los de FacturaScripts.
5. Revisa en **Ajustes → Series** el formato de numeración y el último número, para que las facturas nuevas sigan la serie.

El volcado contiene todos los datos de la empresa: bórralo cuando termines o guárdalo en un sitio seguro.
