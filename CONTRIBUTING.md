# Contribuir

¡Gracias por querer mejorar Facturador!

1. Abre una incidencia antes de cambios grandes, para hablarlo primero.
2. Haz un fork, crea una rama y prepara tu cambio.
3. Comprueba que todo pasa:
   ```bash
   npm run typecheck
   npm test
   ```
4. Abre un *pull request* explicando qué cambia y por qué.

## Normas

- **Código original.** No copies código de otros programas de facturación (FacturaScripts, etc.) aunque su licencia lo permita: Facturador es MIT y se escribe desde cero.
- **Los datos no salen del servidor.** No añadas telemetría ni servicios externos. Cualquier conexión saliente nueva debe ser opcional y estar documentada.
- **Nunca rompas datos existentes.** Los cambios de esquema van en una migración nueva en `server/db.mjs`; no modifiques las ya publicadas.
- **Usa los tokens de color** (`bg-surface`, `text-muted`, `bg-brand`…) para que los temas funcionen.
- Textos de la interfaz y documentación en español.
- Si añades una función, añade su prueba en `server/test/` y actualiza la documentación (y el manual en `scripts/generar-manual.mjs`).

Más detalles en [docs/arquitectura.md](docs/arquitectura.md).
