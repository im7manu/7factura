// Código de servidor del plugin. Se carga al instalar/activar y al arrancar la aplicación.
// ctx.router queda montado en /api/p/<id>/ y solo responde a usuarios con sesión.
export function register(ctx) {
  ctx.router.get('/saludo', (req, res) => {
    const n = ctx.db.prepare("SELECT COUNT(*) n FROM documentos WHERE tipo = 'factura' AND numero IS NOT NULL").get().n;
    res.json({ mensaje: `Hola, ${req.usuario.nombre}. Llevas ${n} facturas emitidas.` });
  });

  // Ejemplo de gancho: se ejecuta cada vez que se emite un documento
  ctx.hooks.on('documento.emitido', (doc) => {
    console.log(`[hola] emitido ${doc.codigo} por ${doc.total} €`);
  });
}
