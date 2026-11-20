// Contenido del centro de ayuda (el mismo que el manual en PDF, en formato de preguntas). Lo usan la web y la aplicación.
// Enlaces dentro de las respuestas: #id (otra pregunta), capturas/xx.jpg (capturas del manual), manual-facturador.pdf,
// privacidad.html y direcciones https://. La web y la aplicación los adaptan al mostrarlos.
// Cada pregunta: id (ancla), prioridad (opcional, >1 para las más consultadas), cat, q (pregunta), a (respuesta en HTML), ejemplos (cómo lo preguntaría alguien:
// el buscador los usa para entender la intención), claves (palabras relacionadas), v ('win' | 'srv' si solo aplica a una versión).
export const AYUDA = {
  categorias: [
    { id: 'empezar', titulo: 'Empezar', color: '#0F6CBD', icono: 'M5 12h14M13 6l6 6-6 6', desc: 'Elegir versión, instalar y dar los primeros pasos.' },
    { id: 'facturas', titulo: 'Facturas', color: '#0F6CBD', icono: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8', desc: 'Crear, emitir, corregir y numerar facturas.' },
    { id: 'documentos', titulo: 'Presupuestos, proformas y albaranes', color: '#038387', icono: 'M4 4h12v16H4zM16 8h4v12h-4M8 9h4M8 13h4', desc: 'Presupuestos, proformas, pedidos y albaranes, y cómo convertirlos en factura.' },
    { id: 'cobros', titulo: 'Cobros y vencimientos', color: '#C8500B', icono: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 3', desc: 'Saber quién te debe, apuntar cobros y recibir avisos.' },
    { id: 'compras', titulo: 'Compras y gastos', color: '#B4009E', icono: 'M3 7h12v10H3zM15 10h4l2 3v4h-6', desc: 'Facturas de proveedores, tickets, gastos y pagos.' },
    { id: 'clientes', titulo: 'Clientes, productos y vehículos', color: '#107C10', icono: 'M16 11a4 4 0 10-8 0M4 21a8 8 0 0116 0', desc: 'Fichas de clientes y proveedores, catálogo y flota.' },
    { id: 'impuestos', titulo: 'IVA, impuestos e informes', color: '#4A5459', icono: 'M4 20V10M10 20V4M16 20v-7M22 20H2', desc: 'Tipos de IVA, exenciones, IRPF y los informes del 303 y el 347.' },
    { id: 'correo', titulo: 'Correo', color: '#8764B8', icono: 'M3 6h18v12H3zM3 7l9 6 9-6', desc: 'Enviar documentos por email desde tu propia cuenta.' },
    { id: 'aspecto', titulo: 'PDF, diseño y plugins', color: '#0B5A8C', icono: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', desc: 'Logo, plantillas de PDF, firma digital, temas y plugins.' },
    { id: 'copias', titulo: 'Copias de seguridad y tus datos', color: '#107C10', icono: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z', desc: 'Dónde están tus datos, copias y cómo recuperarlos.' },
    { id: 'actualizaciones', titulo: 'Actualizaciones', color: '#038387', icono: 'M20 12a8 8 0 11-2.3-5.7M20 4v5h-5', desc: 'Cómo se actualiza 7Factura y por qué es seguro.' },
    { id: 'usuarios', titulo: 'Usuarios, acceso y seguridad', color: '#C8500B', icono: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4', desc: 'Usuarios, contraseñas, móvil y acceso desde fuera.' },
    { id: 'windows', titulo: 'Versión para Windows', color: '#0F6CBD', icono: 'M3 5h18v12H3zM8 21h8M12 17v4', desc: 'Dudas y problemas propios de la versión para Windows.' },
    { id: 'general', titulo: 'Preguntas generales', color: '#5E5E5E', icono: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 115 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01', desc: 'Precio, código abierto, privacidad y normativa.' },
  ],
  preguntas: [
    // ---------------- Empezar ----------------
    { id: 'que-version', cat: 'empezar', q: '¿Qué versión me conviene, la de Windows o la de servidor?',
      ejemplos: ['cual descargo', 'que diferencia hay entre windows y servidor', 'soy autonomo que version instalo', 'tengo una empresa con varios empleados', 'no tengo servidor'],
      claves: 'elegir version diferencias windows servidor autonomo pyme empresa empleados',
      a: `<p>Las dos tienen <strong>las mismas funciones</strong> y se actualizan igual. La diferencia es desde dónde se usa:</p>
<ul><li><strong>Windows</strong>: si eres autónomo y trabajas desde un solo ordenador. Se instala como cualquier programa y solo se puede usar desde ese PC.</li>
<li><strong>Servidor</strong>: si sois varias personas, o quieres usarlo desde el móvil, la tableta o fuera de la oficina. Se instala en un equipo siempre encendido (servidor, NAS, miniPC) y se usa desde el navegador.</li></ul>
<p class="consejo">Puedes empezar con la de Windows y pasar más adelante a la de servidor: haz una copia de seguridad y restáurala en la nueva instalación.</p>` },
    { id: 'instalar-windows', cat: 'empezar', v: 'win', q: '¿Cómo instalo 7Factura en Windows?',
      ejemplos: ['como lo instalo en mi ordenador', 'descargar instalador', 'instalar en el portatil', 'donde se descarga', 'pasos para instalar'],
      claves: 'instalar instalador descargar exe windows pc portatil setup',
      a: `<ol><li>Descarga <a href="https://github.com/im7manu/7factura/releases/latest/download/Facturador-Instalador-Windows.exe">Facturador-Instalador-Windows.exe</a>.</li>
<li>Ábrelo. No pide permisos de administrador. Si Windows muestra «Windows protegió su PC», pulsa <em>Más información → Ejecutar de todas formas</em>.</li>
<li>Sigue el asistente (Siguiente, Acepto, Instalar).</li>
<li>Abre <strong>7Factura</strong> desde el escritorio o el menú Inicio.</li></ol>
<p>Necesitas Windows 10 u 11 de 64 bits. Todo lo demás va incluido.</p>` },
    { id: 'instalar-servidor', cat: 'empezar', v: 'srv', q: '¿Cómo instalo 7Factura en un servidor?',
      ejemplos: ['instalar en un nas', 'docker', 'linux', 'raspberry o minipc', 'instalar para toda la oficina', 'npm start'],
      claves: 'servidor nas docker linux node npm minipc oficina red instalar synology',
      a: `<p>Necesitas un equipo siempre encendido con <strong>Docker</strong> o <strong>Node.js 22.13 o superior</strong>.</p>
<ol><li>Descarga el paquete <code>facturador-X.Y.Z.tar.gz</code> de la <a href="https://github.com/im7manu/7factura/releases/latest">última versión</a> y descomprímelo.</li>
<li>Dentro de la carpeta, ejecuta <code>npm start</code>. Con Docker, desde el código fuente: <code>docker compose up -d --build</code>.</li>
<li>Abre <code>http://localhost:9100</code>, o <code>http://IP-DEL-SERVIDOR:9100</code> desde otros equipos.</li></ol>
<p>Guía completa (arranque automático, HTTPS, NAS, variables): <a href="https://github.com/im7manu/7factura/blob/main/docs/instalacion.md">docs/instalacion.md</a>.</p>` },
    { id: 'primera-configuracion', cat: 'empezar', q: '¿Qué tengo que hacer la primera vez que lo abro?',
      ejemplos: ['primeros pasos', 'configurar mi empresa', 'poner mis datos fiscales', 'crear usuario administrador', 'asistente inicial'],
      claves: 'primera vez configuracion asistente administrador empresa nif razon social iban datos fiscales',
      a: `<p>Se abre un asistente de dos pasos:</p>
<ol><li><strong>Tu usuario administrador</strong>: nombre, usuario y una contraseña de al menos 10 caracteres con mayúsculas, minúsculas, números y un símbolo.</li>
<li><strong>Los datos de tu empresa</strong>: razón social o tu nombre, NIF, dirección, IBAN y el texto legal del pie de las facturas.</li></ol>
<p>Todo se puede cambiar después en <span class="ruta">Ajustes → Mi empresa</span>.</p>
<figure><img src="capturas/01-acceso.jpg" loading="lazy" alt="Pantalla de inicio de sesión"><figcaption>Pantalla de inicio de sesión.</figcaption></figure>` },
    { id: 'pantalla-inicio', cat: 'empezar', q: '¿Qué muestra la pantalla de inicio?',
      ejemplos: ['que significan los cuadros de colores', 'resumen del año', 'cuanto he facturado', 'cuanto me deben', 'el menu lateral'],
      claves: 'inicio panel mosaicos resumen facturado trimestre pendiente menu lateral campana',
      a: `<p>De un vistazo: lo facturado en el año (base imponible), el trimestre en curso con su IVA, lo pendiente de cobro y las facturas vencidas. Cada mosaico es un acceso directo.</p>
<ul><li>Barra superior: botón <strong>Nueva factura</strong>, campana de avisos, modo claro u oscuro y tu cuenta.</li>
<li>Menú lateral por secciones (Ventas, Compras, Datos y General). La flecha lo deja solo con iconos.</li></ul>
<figure><img src="capturas/02-inicio.jpg" loading="lazy" alt="Pantalla de inicio"><figcaption>Inicio: mosaicos, avisos de cobro y últimas facturas.</figcaption></figure>` },
    { id: 'importar-facturascripts', cat: 'empezar', q: '¿Puedo traer mis datos desde otro programa (FacturaScripts)?',
      ejemplos: ['migrar desde otro programa', 'importar clientes', 'pasar mis facturas antiguas', 'tengo facturascripts', 'importar excel'],
      claves: 'importar migrar facturascripts clientes productos facturas antiguas pasar datos',
      a: `<p>Sí, desde FacturaScripts se pueden importar clientes, productos y facturas con una herramienta incluida. Instrucciones: <a href="https://github.com/im7manu/7factura/blob/main/docs/importar-facturascripts.md">Importar desde FacturaScripts</a>.</p>
<p>Desde otros programas todavía no hay importación automática; puedes dar de alta los clientes y productos a mano.</p>` },

    // ---------------- Facturas ----------------
    { id: 'crear-factura', cat: 'facturas', prioridad: 1.2, q: '¿Cómo hago una factura?',
      ejemplos: ['factura', 'hago una factura', 'crear factura nueva', 'facturar a un cliente', 'hacer mi primera factura', 'emitir una factura', 'pasos para facturar'],
      claves: 'nueva factura crear hacer emitir borrador lineas cliente serie',
      a: `<ol><li>Pulsa <strong>Nueva factura</strong> (arriba a la derecha o en el inicio).</li>
<li>Elige el cliente, la serie, la fecha y la forma de pago.</li>
<li>Añade las líneas: concepto (del catálogo o a mano), cantidad, precio, descuento e IVA.</li>
<li>Guarda: queda como <strong>borrador</strong> y puedes cambiar todo.</li>
<li>Pulsa <strong>Emitir</strong>: recibe su número (por ejemplo 31/2026) y ya no se puede modificar.</li></ol>
<figure><img src="capturas/06-nueva-factura.jpg" loading="lazy" alt="Nueva factura"><figcaption>Nueva factura: cliente, serie, fechas y líneas.</figcaption></figure>` },
    { id: 'corregir-factura', cat: 'facturas', q: 'Me he equivocado en una factura emitida. ¿Cómo la corrijo?',
      ejemplos: ['cambiar una factura ya emitida', 'borrar una factura', 'eliminar factura', 'anular factura', 'factura mal hecha', 'error en factura', 'modificar el importe de una factura', 'abono'],
      claves: 'rectificativa rectificar corregir error equivocado anular borrar eliminar modificar cambiar abono devolucion',
      a: `<p>Las facturas emitidas <strong>no se pueden modificar ni borrar</strong> (lo exige la normativa). Para corregirla:</p>
<ol><li>Abre la factura y pulsa <strong>Rectificar</strong>.</li>
<li>Indica el motivo. Se crea una factura rectificativa (serie R) con las líneas en negativo.</li>
<li>Ajústala si hace falta y emítela. Después, si procede, haz la factura correcta.</li></ol>
<p class="consejo">Si todavía es un <strong>borrador</strong>, puedes cambiarla o borrarla sin problema.</p>` },
    { id: 'numeracion', cat: 'facturas', q: '¿Cómo cambio el formato del número de factura o creo otra serie?',
      ejemplos: ['numero de factura con el año', 'series de facturacion', 'formato 2026/001'],
      claves: 'numeracion numero serie formato correlativo contador año prefijo',
      a: `<p>En <span class="ruta">Ajustes → Series y formas de pago</span> cada serie tiene su formato, por ejemplo <code>{num}/{año}</code> → <code>31/2026</code>.</p>
<ul><li>La numeración es correlativa: el número se asigna al emitir.</li>
<li>No se puede emitir con una fecha anterior a la última factura de la serie.</li>
<li>Hay series para rectificativas (R) y simplificadas (S), y formatos propios para presupuestos y proformas.</li></ul>
<figure><img src="capturas/15-ajustes-series.jpg" loading="lazy" alt="Ajustes de series"><figcaption>Series de facturación y formatos de numeración.</figcaption></figure>` },
    { id: 'factura-simplificada', cat: 'facturas', q: '¿Puedo hacer facturas simplificadas (tickets)?',
      ejemplos: ['factura sin datos del cliente', 'ticket de venta', 'venta a un particular sin nif', 'factura simplificada'],
      claves: 'simplificada ticket particular sin nif consumidor final',
      a: `<p>Sí. Usa la serie de facturas <strong>simplificadas (S)</strong> para ventas sin los datos completos del cliente.</p>` },
    { id: 'pdf-factura', cat: 'facturas', q: '¿Cómo descargo o imprimo el PDF de una factura?',
      ejemplos: ['imprimir factura', 'guardar en pdf', 'ver la factura', 'pdf sin precios', 'descargar factura'],
      claves: 'pdf imprimir descargar ver sin valorar sin precios',
      a: `<p>Dentro de la factura, pulsa <strong>PDF</strong> para verlo, descargarlo o imprimirlo. También existe la opción <strong>sin valorar</strong> (sin precios), útil para albaranes o copias para el transportista.</p>
<p>Para cambiar el aspecto del PDF (logo, colores, plantilla) mira <a href="#logo-pdf">cómo poner tu logo</a>.</p>` },
    { id: 'duplicar', cat: 'facturas', q: '¿Puedo repetir una factura que hago todos los meses?',
      ejemplos: ['copiar una factura', 'factura recurrente', 'hacer la misma factura cada mes', 'duplicar factura', 'cuota mensual'],
      claves: 'duplicar copiar repetir recurrente mensual periodica igual',
      a: `<p>Sí: abre la factura y pulsa <strong>Duplicar</strong>. Se crea un borrador igual con la fecha de hoy; revísalo y emítelo.</p>
<p>Si trabajas con albaranes, <a href="#facturar-mes">Facturar el mes</a> crea las facturas de todos tus clientes de golpe.</p>` },
    { id: 'adjuntos', cat: 'facturas', q: '¿Puedo adjuntar archivos a una factura?',
      ejemplos: ['subir el albaran firmado', 'guardar justificante', 'adjuntar foto', 'añadir documento a factura'],
      claves: 'adjuntar adjunto archivo subir foto justificante documento',
      a: `<p>Sí. En cada documento hay una zona de <strong>Adjuntos</strong>: arrastra albaranes firmados, justificantes, fotos… (hasta 15 MB por archivo). Se guardan en tu equipo junto al resto de datos.</p>` },
    { id: 'huella', cat: 'facturas', q: '¿Qué es la huella de integridad de las facturas?',
      ejemplos: ['hash de la factura', 'para que sirve la huella', 'antifraude', 'inalterabilidad'],
      claves: 'huella integridad hash encadenada antifraude inalterable sha',
      a: `<p>Cada factura emitida guarda una huella digital (SHA-256) encadenada con la anterior. Si alguien modificara una factura después de emitirla, la cadena se rompería y se detectaría. Es la base de lo que pide VERI*FACTU (ver <a href="#verifactu">¿Cumple con VERI*FACTU?</a>).</p>
<figure><img src="capturas/04-factura.jpg" loading="lazy" alt="Factura emitida"><figcaption>Factura emitida con sus cobros, adjuntos, correos y huella.</figcaption></figure>` },

    // ---------------- Documentos ----------------
    { id: 'presupuesto', cat: 'documentos', q: '¿Cómo hago un presupuesto y lo convierto en factura?',
      ejemplos: ['hacer una oferta', 'presupuesto aceptado', 'pasar presupuesto a factura', 'cotizacion', 'el cliente ha aceptado el presupuesto'],
      claves: 'presupuesto oferta cotizacion convertir aceptar rechazar factura pedido',
      a: `<p>En <strong>Presupuestos</strong> crea uno igual que una factura y emítelo. Después puedes marcarlo como aceptado o rechazado y, con <strong>Convertir en…</strong>, pasarlo a pedido, albarán o directamente a factura.</p>
<p>Cada documento muestra de dónde viene y en qué se ha convertido.</p>
<figure><img src="capturas/07-presupuesto.jpg" loading="lazy" alt="Presupuesto"><figcaption>Presupuesto emitido con sus acciones.</figcaption></figure>` },
    { id: 'proforma', cat: 'documentos', q: '¿Qué es una proforma y cómo se usa?',
      ejemplos: ['factura proforma', 'cobrar por adelantado', 'anticipo', 'documento antes de la factura'],
      claves: 'proforma anticipo adelantado previo',
      a: `<p>Es un documento previo a la factura, con su propia numeración (PF1/2026). <strong>No es una factura</strong>: no cuenta para el IVA ni para los informes. Cuando proceda, pulsa <strong>Crear factura</strong> y se convierte en una.</p>` },
    { id: 'albaran', cat: 'documentos', q: '¿Cómo hago un albarán y lo firma el cliente en el móvil?',
      ejemplos: ['nota de entrega', 'firma del receptor', 'firmar con el dedo', 'albaran sin precios', 'recibi conforme', 'firma en la tablet'],
      claves: 'albaran entrega firma firmar receptor dedo movil tablet valorado sin valorar recibi conforme dni',
      a: `<ul><li>Cada albarán puede ser <strong>valorado</strong> (con precios) o <strong>sin valorar</strong>.</li>
<li>Con <strong>Firmar</strong>, quien recibe la mercancía firma con el dedo en el móvil o la tableta e indica su nombre y DNI. La firma sale en el PDF («Recibí conforme»).</li>
<li>Sin firmar, el recuadro sale en blanco para firmarlo en papel.</li></ul>
<p class="aviso">Firmar en el móvil requiere la versión de servidor (la de Windows solo se usa desde ese ordenador). En Windows puede firmarse en una pantalla táctil.</p>
<figure><img src="capturas/08-albaran.jpg" loading="lazy" alt="Albarán firmado"><figcaption>Albarán firmado por el receptor.</figcaption></figure>` },
    { id: 'facturar-mes', cat: 'documentos', q: '¿Cómo facturo todos los albaranes del mes de una vez?',
      ejemplos: ['factura mensual de albaranes', 'agrupar albaranes', 'una factura por cliente', 'cierre de mes', 'facturar varios albaranes juntos'],
      claves: 'facturar mes agrupar albaranes juntos mensual cierre varios',
      a: `<ul><li>En <strong>Albaranes</strong>, pulsa <strong>Facturar el mes</strong>: crea una factura por cliente con todos sus albaranes pendientes del mes. Puedes dejarlas en borrador o emitirlas directamente.</li>
<li>Para unos albaranes concretos, márcalos en el listado y pulsa <strong>Facturar juntos</strong>.</li></ul>
<p>Un albarán nunca se factura dos veces.</p>
<figure><img src="capturas/09-facturar-mes.jpg" loading="lazy" alt="Facturar el mes"><figcaption>Facturar el mes: una factura por cliente.</figcaption></figure>` },
    { id: 'pedidos', cat: 'documentos', q: '¿Para qué sirven los pedidos?',
      ejemplos: ['pedido de cliente', 'encargo', 'ocultar pedidos y albaranes', 'no uso albaranes'],
      claves: 'pedido encargo circuito ocultar menu ventas',
      a: `<p>Para registrar lo que un cliente te encarga antes de entregarlo. El circuito completo es presupuesto → pedido → albarán → factura, pero puedes saltarte pasos.</p>
<p>Si no usas pedidos o albaranes, ocúltalos en <span class="ruta">Ajustes → Ventas</span>.</p>` },

    // ---------------- Cobros ----------------
    { id: 'apuntar-cobro', cat: 'cobros', prioridad: 1.1, q: '¿Cómo marco una factura como cobrada?',
      ejemplos: ['anular un cobro', 'el cliente me ha pagado', 'registrar un pago', 'factura pagada', 'cobro parcial', 'me han pagado la mitad'],
      claves: 'cobrar cobrada pagado pago cliente parcial registrar apuntar transferencia',
      a: `<ol><li>Abre la factura y, en <strong>Vencimientos y cobros</strong>, pulsa <strong>Cobrar</strong>.</li>
<li>Indica la fecha, el importe y la forma de pago. Puede ser un cobro parcial.</li></ol>
<p>La factura pasa sola a <strong>Cobrada</strong> cuando está pagada entera. Si te equivocas, puedes anular el cobro.</p>` },
    { id: 'quien-me-debe', cat: 'cobros', q: '¿Cómo veo quién me debe dinero?',
      ejemplos: ['facturas pendientes de cobro', 'impagados', 'morosos', 'facturas vencidas', 'clientes que no han pagado'],
      claves: 'deben pendiente cobro impagado moroso vencida deuda',
      a: `<p>En <strong>Cobros</strong> tienes los recibos pendientes, vencidos y cobrados. En el inicio, el mosaico <em>Pendiente de cobro</em> y los <em>Avisos de cobro</em> te lo resumen, y en <strong>Clientes</strong> ves lo pendiente de cada uno.</p>
<figure><img src="capturas/10-cobros.jpg" loading="lazy" alt="Cobros"><figcaption>Cobros pendientes, vencidos y cobrados.</figcaption></figure>` },
    { id: 'vencimientos', cat: 'cobros', q: '¿Cómo se calculan los vencimientos? ¿Puedo pagar a 30, 60 o 90 días?',
      ejemplos: ['pago a 30 dias', 'plazos de pago', 'dias fijos de pago', 'fecha de vencimiento', 'cambiar vencimiento', 'pagos fraccionados'],
      claves: 'vencimiento plazo 30 60 90 dias fijos fecha recibo forma de pago',
      a: `<p>Al emitir una factura se crean sus vencimientos (recibos) según las condiciones del cliente o de la forma de pago:</p>
<ul><li><strong>Plazos</strong>: 30, 60, 90 días… o varios a la vez (30-60-90).</li>
<li><strong>Días fijos de pago</strong> del cliente, por ejemplo los días 10 y 25.</li></ul>
<p>Se configuran en la ficha del cliente, en las formas de pago y en <span class="ruta">Ajustes → Cobros</span>. Los vencimientos de una factura se pueden editar a mano.</p>
<figure><img src="capturas/16-ajustes-cobros.jpg" loading="lazy" alt="Ajustes de cobros"><figcaption>Ajustes → Cobros.</figcaption></figure>` },
    { id: 'avisos-cobro', cat: 'cobros', q: '¿Me avisa de los cobros que vencen o de los impagos?',
      ejemplos: ['recordatorio de cobro', 'alerta de vencimiento', 'notificaciones', 'la campana', 'avisos'],
      claves: 'aviso avisos alerta recordatorio campana notificacion vence impago',
      a: `<p>Sí. La <strong>campana</strong> de la barra superior y el inicio muestran los recibos que vencen en los próximos días, los impagados desde hace un tiempo y los pagos a proveedores. Los días se ajustan en <span class="ruta">Ajustes → Cobros</span>.</p>` },

    // ---------------- Compras ----------------
    { id: 'factura-proveedor', cat: 'compras', q: '¿Cómo registro una factura de un proveedor?',
      ejemplos: ['factura recibida', 'factura de compra', 'apuntar lo que me facturan', 'proveedores', 'gasto con factura'],
      claves: 'factura recibida proveedor compra registrar soportado',
      a: `<p>En <strong>Facturas recibidas</strong> crea una con el número de factura del proveedor. 7Factura le da además un número interno correlativo (FC1/2026) y te avisa si esa factura ya estaba registrada. Genera sus pagos pendientes.</p>
<figure><img src="capturas/11-compra.jpg" loading="lazy" alt="Factura recibida"><figcaption>Factura recibida con IVA deducible y vehículo por línea.</figcaption></figure>` },
    { id: 'gastos-tickets', cat: 'compras', q: '¿Cómo apunto un ticket de gasolina, peaje o parking?',
      ejemplos: ['gasto sin factura', 'ticket de combustible', 'gastos del dia a dia', 'dietas', 'gasoil'],
      claves: 'ticket gasto gasolina gasoil combustible peaje parking dieta',
      a: `<p>En <strong>Gastos y tickets</strong>. El proveedor es opcional y se dan por pagados al registrarlos. Indica si su IVA es deducible y, si quieres, a qué vehículo corresponde.</p>` },
    { id: 'pagos-proveedores', cat: 'compras', q: '¿Cómo controlo lo que tengo que pagar a mis proveedores?',
      ejemplos: ['pagos pendientes', 'que debo', 'facturas por pagar', 'vencimientos de proveedores'],
      claves: 'pagos pagar proveedor debo pendiente',
      a: `<p>En <strong>Pagos</strong> está todo lo pendiente de pagar a proveedores, con avisos en la campana. Funciona igual que los cobros: apunta cada pago con su fecha e importe.</p>` },
    { id: 'iva-deducible', cat: 'compras', q: '¿Cómo indico si el IVA de una compra es deducible?',
      ejemplos: ['iva soportado', 'desgravar iva', 'gasto no deducible', 'iva que me puedo deducir'],
      claves: 'deducible soportado desgravar iva compra 303',
      a: `<p>Cada factura recibida o gasto tiene la casilla <strong>IVA deducible</strong>. Si está marcada, su IVA cuenta como soportado en el resumen del modelo 303. El valor por defecto se elige en <span class="ruta">Ajustes → Compras</span>.</p>` },

    // ---------------- Clientes ----------------
    { id: 'nuevo-cliente', cat: 'clientes', q: '¿Cómo doy de alta un cliente o un proveedor?',
      ejemplos: ['añadir cliente', 'nuevo proveedor', 'crear cliente nuevo', 'ficha de cliente', 'datos del cliente', 'nif no valido'],
      claves: 'cliente alta nuevo ficha nif cif direccion email',
      a: `<p>En <strong>Clientes</strong> (o <strong>Proveedores</strong>) → <strong>Nuevo</strong>: nombre, NIF (se comprueba que es válido), dirección, email, forma de pago y notas. Además puedes indicar su IVA habitual, si tiene recargo de equivalencia y sus condiciones de pago.</p>
<figure><img src="capturas/14-clientes.jpg" loading="lazy" alt="Clientes"><figcaption>Listado de clientes con sus facturas y lo pendiente.</figcaption></figure>` },
    { id: 'productos', cat: 'clientes', q: '¿Puedo guardar mis productos o servicios con su precio?',
      ejemplos: ['catalogo', 'tarifa de precios', 'conceptos habituales', 'articulos', 'servicios que facturo siempre'],
      claves: 'producto servicio catalogo articulo precio concepto tarifa',
      a: `<p>Sí, en <strong>Productos</strong>: conceptos habituales con su precio e IVA (por ejemplo «Hora de trabajo» o «Porte Madrid–Valencia»). Al hacer una línea, los eliges y se rellenan solos.</p>` },
    { id: 'vehiculos', cat: 'clientes', q: '¿Cómo controlo los gastos y la ITV de mis vehículos?',
      ejemplos: ['camiones', 'furgoneta', 'flota', 'transportista', 'itv caducada', 'gasto por camion', 'conductores'],
      claves: 'vehiculo camion furgoneta flota itv matricula conductor transporte gasto',
      a: `<p>En <strong>Vehículos</strong> guardas la flota con matrícula, tipo, modelo, estado y fecha de la ITV (avisa si está caducada). Si en las compras indicas el vehículo de cada línea, verás cuánto cuesta cada uno al año. También hay una ficha de <strong>Conductores</strong>.</p>
<figure><img src="capturas/12-vehiculos.jpg" loading="lazy" alt="Vehículos"><figcaption>Vehículos con su ITV y su gasto anual.</figcaption></figure>` },

    // ---------------- Impuestos ----------------
    { id: 'tipos-iva', cat: 'impuestos', q: '¿Qué tipos de IVA puedo usar? ¿Y facturas sin IVA?',
      ejemplos: ['iva 21 10 4', 'factura exenta de iva', 'operacion no sujeta', 'iva 0', 'formacion exenta', 'sanidad exenta'],
      claves: 'iva tipo 21 10 4 0 exenta exento no sujeta articulo leyenda',
      a: `<p>En cada línea eliges el impuesto: IVA al <strong>21, 10, 4 o 0 %</strong>, o una operación sin IVA: <strong>exenta</strong> (con su artículo legal), exportación, entrega intracomunitaria, inversión del sujeto pasivo o no sujeta. El PDF incluye la leyenda legal correspondiente.</p>
<p class="consejo">Si un cliente siempre lleva el mismo tratamiento (por ejemplo, es de otro país de la UE), indícalo en su ficha como <em>IVA habitual</em>.</p>` },
    { id: 'intracomunitaria', cat: 'impuestos', q: '¿Cómo facturo a un cliente de otro país de la UE o de fuera de Europa?',
      ejemplos: ['cliente extranjero', 'factura a francia', 'exportacion', 'operacion intracomunitaria', 'vies', 'cliente de portugal', 'factura sin iva a empresa europea'],
      claves: 'intracomunitaria ue europa extranjero exportacion pais vies portugal francia alemania',
      a: `<ul><li><strong>Empresa de otro país de la UE</strong>: elige «Entrega intracomunitaria» (bienes) o la operación correspondiente en cada línea o como IVA habitual del cliente. El PDF lleva la leyenda legal.</li>
<li><strong>Fuera de la UE</strong>: «Exportación».</li></ul>
<p class="aviso">Comprueba con tu gestoría el tratamiento correcto de cada operación y que el cliente tiene NIF-IVA válido.</p>` },
    { id: 'recargo', cat: 'impuestos', q: '¿Cómo aplico el recargo de equivalencia?',
      ejemplos: ['cliente minorista', 'recargo 5,2', 'tienda con recargo', 'comerciante minorista'],
      claves: 'recargo equivalencia minorista comerciante tienda 5,2 1,4',
      a: `<p>Marca <strong>Recargo de equivalencia</strong> en la ficha del cliente (comerciantes minoristas). Se calcula solo en sus líneas, según el tipo de IVA.</p>` },
    { id: 'irpf', cat: 'impuestos', q: '¿Cómo pongo la retención de IRPF en mis facturas?',
      ejemplos: ['retencion 15', 'retencion del 7 nuevos autonomos', 'irpf profesional', 'factura con retencion'],
      claves: 'irpf retencion 15 7 1 2 19 profesional autonomo',
      a: `<p>En las líneas de la factura elige la retención de IRPF: <strong>1, 2, 7, 15 o 19 %</strong>. Se descuenta del total y aparece desglosada en el PDF.</p>` },
    { id: 'suplidos', cat: 'impuestos', q: '¿Qué son los suplidos y cómo los facturo?',
      ejemplos: ['gastos pagados en nombre del cliente', 'tasas', 'peajes repercutidos', 'gasto sin iva en factura'],
      claves: 'suplido suplidos tasa peaje nombre cliente base imponible',
      a: `<p>Son gastos que pagas en nombre del cliente (peajes, tasas…). Marca la línea como <strong>Suplido</strong>: no forma parte de la base imponible ni lleva IVA, pero se suma al total.</p>` },
    { id: 'modelo-303', cat: 'impuestos', q: '¿Cómo saco el IVA del trimestre para el modelo 303?',
      ejemplos: ['declaracion trimestral', 'cuanto iva tengo que pagar', 'iva a ingresar', 'liquidacion de iva', 'hacienda trimestre', 'informe para la gestoria'],
      claves: '303 iva trimestre trimestral declaracion hacienda aeat gestoria repercutido soportado liquidacion',
      a: `<p>En <strong>Informes</strong> tienes el resumen del IVA por trimestre: repercutido, soportado deducible y el resultado (a ingresar o a compensar).</p>
<p class="aviso">Son datos de referencia: revísalos siempre con tu gestoría antes de presentar la declaración.</p>
<figure><img src="capturas/13-informes.jpg" loading="lazy" alt="Informes"><figcaption>Informes del ejercicio.</figcaption></figure>` },
    { id: 'modelo-347', cat: 'impuestos', q: '¿Saca el modelo 347 de operaciones con terceros?',
      ejemplos: ['clientes de mas de 3005 euros', 'declaracion anual de operaciones', '347'],
      claves: '347 terceros anual 3005 clientes proveedores',
      a: `<p>Sí. En <strong>Informes</strong> se listan los clientes y proveedores que superan 3.005,06 € en el año, desglosados por trimestres.</p>` },
    { id: 'verifactu', cat: 'impuestos', q: '¿Cumple con VERI*FACTU y la ley antifraude?',
      ejemplos: ['verifactu', 'ley antifraude', 'sistema de facturacion homologado', 'envio a hacienda', 'ley crea y crece', 'factura electronica'],
      claves: 'verifactu veri*factu antifraude aeat hacienda homologado factura electronica crea crece obligatorio',
      a: `<p>7Factura ya guarda una huella de integridad encadenada en cada factura y clasifica el IVA con los mismos códigos que VERI*FACTU, pero <strong>todavía no genera ni envía los registros a la Agencia Tributaria</strong>. Se añadirá antes de que sea obligatorio y llegará con una actualización automática.</p>` },

    // ---------------- Correo ----------------
    { id: 'enviar-correo', cat: 'correo', q: '¿Cómo envío una factura por correo?',
      ejemplos: ['mandar factura por email', 'enviar presupuesto al cliente', 'email con el pdf', 'mandar por mail'],
      claves: 'enviar correo email mail mandar pdf adjunto',
      a: `<p>En cualquier documento emitido pulsa <strong>Enviar por correo</strong>. Se abre una ventana con el email del cliente, el asunto y el texto de la plantilla, y el PDF adjunto. Puedes cambiarlo todo antes de enviar.</p>
<p>Queda registrado qué se envió, a quién y cuándo.</p>
<figure><img src="capturas/05-correo.jpg" loading="lazy" alt="Enviar por correo"><figcaption>Enviar una factura por correo.</figcaption></figure>` },
    { id: 'conectar-correo', cat: 'correo', q: '¿Cómo conecto mi Gmail, Outlook u otro correo?',
      ejemplos: ['no llegan los correos', 'el correo no se envia', 'configurar email', 'usar mi cuenta de gmail', 'outlook microsoft 365', 'smtp', 'correo de mi dominio', 'yahoo', 'no me deja enviar correos'],
      claves: 'gmail google outlook hotmail microsoft 365 exchange smtp yahoo configurar cuenta correo dominio',
      a: `<p>En <span class="ruta">Ajustes → Correo</span> cada usuario conecta su propia cuenta:</p>
<ul><li><strong>Google</strong> (Gmail o Workspace) o <strong>Microsoft 365</strong> (Outlook o Exchange).</li>
<li><strong>SMTP</strong> para cualquier otro proveedor (Yahoo, el correo de tu hosting…).</li></ul>
<p>El correo sale desde tu buzón y queda también en tu carpeta de enviados. Las credenciales se guardan cifradas. Guía detallada: <a href="https://github.com/im7manu/7factura/blob/main/docs/correo.md">Correo</a>.</p>
<figure><img src="capturas/17-ajustes-correo.jpg" loading="lazy" alt="Ajustes de correo"><figcaption>Ajustes → Correo.</figcaption></figure>` },
    { id: 'plantillas-correo', cat: 'correo', q: '¿Puedo cambiar el texto de los correos que envío?',
      ejemplos: ['plantilla de email', 'mensaje predeterminado', 'asunto del correo', 'texto del email'],
      claves: 'plantilla texto asunto mensaje variables cliente numero total',
      a: `<p>Sí. En <span class="ruta">Ajustes → Correo</span> editas el asunto y el texto de cada tipo de documento, con variables como <code>{cliente}</code>, <code>{numero}</code>, <code>{total}</code> o <code>{vencimiento}</code>.</p>` },

    // ---------------- Aspecto ----------------
    { id: 'logo-pdf', cat: 'aspecto', q: '¿Cómo pongo mi logo y cambio el diseño del PDF?',
      ejemplos: ['poner mi logo en las facturas', 'añadir logotipo a la factura', 'cambiar colores de la factura', 'plantilla de factura', 'personalizar factura', 'marca de agua', 'fuente'],
      claves: 'logo logotipo diseño plantilla pdf colores personalizar marca agua tipografia fuente',
      a: `<p>Instala el plugin <strong>Diseño de PDF</strong> (<span class="ruta">Ajustes → Plugins</span>). Tienes cinco plantillas (Moderna, Clásica, Minimalista, Banda lateral y Compacta), colores, tipografía, logo, columnas, textos de cabecera y pie, y marca de agua, con vista previa en vivo. Puedes tener diseños distintos por tipo de documento o serie.</p>
<figure><img src="capturas/22-diseno-pdf.jpg" loading="lazy" alt="Diseño de PDF"><figcaption>Plugin Diseño de PDF.</figcaption></figure>` },
    { id: 'firma-digital', cat: 'aspecto', q: '¿Puedo firmar digitalmente las facturas con mi certificado?',
      ejemplos: ['certificado fnmt', 'firma electronica', 'p12 pfx', 'factura firmada', 'sello de la empresa', 'firma escaneada'],
      claves: 'firma digital certificado fnmt electronica p12 pfx sello firmar pdf adobe',
      a: `<p>Sí, con el plugin <strong>Diseño de PDF</strong>:</p>
<ul><li><strong>Firma digital</strong> con tu certificado (por ejemplo el de la FNMT, archivo .p12 o .pfx), verificable en Adobe y otros lectores. El certificado se guarda cifrado.</li>
<li><strong>Firma visual</strong> en el pie: imagen de tu firma manuscrita o del sello.</li></ul>` },
    { id: 'temas', cat: 'aspecto', q: '¿Puedo cambiar los colores o el aspecto del programa?',
      ejemplos: ['modo oscuro', 'cambiar tema', 'colores de la aplicacion', 'foto en la pantalla de inicio', 'aspecto clasico'],
      claves: 'tema temas colores oscuro claro aspecto apariencia foto fondo login',
      a: `<p>El modo claro u oscuro se cambia con el botón de la luna de la barra superior. Con el plugin <strong>Temas</strong> el administrador elige el aspecto de toda la aplicación (Metro, Frutiger Aero, Windows clásico, Alto contraste, Nórdico…) y puede poner fotos de la empresa en la pantalla de inicio de sesión.</p>
<figure><img src="capturas/21-temas.jpg" loading="lazy" alt="Temas"><figcaption>Plugin Temas.</figcaption></figure>` },
    { id: 'plugins', cat: 'aspecto', q: '¿Qué son los plugins y cómo se instalan?',
      ejemplos: ['instalar complementos', 'extensiones', 'añadir funciones', 'plugin de copias'],
      claves: 'plugin plugins complemento extension instalar funciones',
      a: `<p>Añaden funciones sin tocar el programa. Un administrador los instala desde <span class="ruta">Ajustes → Plugins</span>, que muestra los disponibles en el <a href="https://github.com/im7manu/7factura-plugins">repositorio oficial</a>. Cada descarga se verifica con su huella SHA-256. Los oficiales son: Copias de seguridad, Temas y Diseño de PDF.</p>
<figure><img src="capturas/19-plugins.jpg" loading="lazy" alt="Plugins"><figcaption>Página de plugins.</figcaption></figure>` },

    // ---------------- Copias ----------------
    { id: 'hacer-copia', cat: 'copias', q: '¿Cómo hago una copia de seguridad?',
      ejemplos: ['backup', 'no quiero perder mis facturas', 'guardar mis datos', 'copia automatica', 'exportar todo'],
      claves: 'copia seguridad backup respaldo guardar exportar zip automatica perder',
      a: `<ol><li>Instala el plugin <strong>Copias de seguridad</strong> (<span class="ruta">Ajustes → Plugins</span>).</li>
<li>Hace una copia automática cada semana (por defecto el lunes a las 3:00; si el equipo estaba apagado, al volver a arrancar) y puedes pulsar <strong>Hacer una copia ahora</strong> cuando quieras.</li>
<li><strong>Descarga el ZIP</strong> y guárdalo fuera del equipo: un disco externo, un pendrive o tu nube.</li></ol>
<p class="aviso">Tus datos solo están en tu equipo. Si se estropea y no tienes una copia fuera, se pierden. El ZIP contiene todos los datos de la empresa: guárdalo en un sitio seguro.</p>
<figure><img src="capturas/20-copias.jpg" loading="lazy" alt="Copias de seguridad"><figcaption>Copias de seguridad: descargar, restaurar y programar.</figcaption></figure>` },
    { id: 'restaurar', cat: 'copias', q: 'Se me ha estropeado el ordenador. ¿Cómo recupero mis datos?',
      ejemplos: ['restaurar copia', 'ordenador nuevo', 'he perdido el servidor', 'recuperar facturas', 'formatear el pc', 'cambiar de ordenador', 'pasar a otro ordenador'],
      claves: 'restaurar recuperar perdido estropeado roto nuevo ordenador formatear cambiar migrar trasladar',
      a: `<ol><li>Instala 7Factura en el equipo nuevo.</li>
<li>Instala el plugin <strong>Copias de seguridad</strong>.</li>
<li>Pulsa <strong>Restaurar</strong> y sube el último ZIP que descargaste. La aplicación se reinicia sola con todos tus datos.</li></ol>
<p>Antes de restaurar, lo que había se guarda aparte por si hay que volver atrás. Este mismo método sirve para pasar de la versión de Windows a la de servidor.</p>` },
    { id: 'donde-datos', cat: 'copias', q: '¿Dónde se guardan mis datos y mis facturas?',
      ejemplos: ['donde se guardan las facturas', 'donde guarda los datos', 'carpeta de datos', 'base de datos', 'donde esta el archivo', 'se suben a internet', 'appdata'],
      claves: 'datos carpeta data base de datos archivo localappdata nube',
      a: `<p>Solo en tu equipo, nunca en la nube:</p>
<ul><li><strong>Windows</strong>: <code>%LOCALAPPDATA%\\Facturador\\data</code> (escríbelo en la barra de direcciones del Explorador).</li>
<li><strong>Servidor</strong>: la carpeta <code>data/</code> de la instalación (o el volumen de Docker).</li></ul>
<p>Dentro está la base de datos (<code>facturador.db</code>), los adjuntos, los plugins y la clave <code>secreto.key</code> que cifra las credenciales.</p>` },
    { id: 'copia-manual', cat: 'copias', q: '¿Puedo copiar los datos a mano, sin el plugin?',
      ejemplos: ['copiar la carpeta', 'copia manual', 'disco externo'],
      claves: 'copia manual carpeta copiar secreto key',
      a: `<p>Sí: copia la carpeta de datos entera <strong>con 7Factura cerrado</strong>. Incluye siempre el archivo <code>secreto.key</code>: sin él no se pueden leer las credenciales de correo ni el certificado guardados.</p>` },

    // ---------------- Actualizaciones ----------------
    { id: 'como-actualizar', cat: 'actualizaciones', q: '¿Cómo se actualiza 7Factura?',
      ejemplos: ['nueva version', 'actualizar programa', 'actualizacion automatica', 'tengo la ultima version', 'version instalada'],
      claves: 'actualizar actualizacion version nueva automatica instalar ahora',
      a: `<p>Solo. Cada hora comprueba si hay una versión nueva en <a href="https://github.com/im7manu/7factura/releases">GitHub</a>. El administrador la ve en <span class="ruta">Ajustes → Actualizaciones</span> y con un aviso en la barra superior:</p>
<ul><li><strong>Instalar ahora</strong> la instala en unos segundos.</li>
<li>Con la <strong>actualización automática</strong> activada, se instala sola en la franja horaria que elijas.</li></ul>
<p>En la versión de Windows las actualizaciones se aplican mientras 7Factura está abierto.</p>
<figure><img src="capturas/18-actualizaciones.jpg" loading="lazy" alt="Actualizaciones"><figcaption>Ajustes → Actualizaciones.</figcaption></figure>` },
    { id: 'actualizacion-segura', cat: 'actualizaciones', q: '¿Puedo perder datos al actualizar?',
      ejemplos: ['es seguro actualizar', 'y si falla la actualizacion', 'vuelta atras', 'actualizacion rota', 'se ha ido la luz actualizando'],
      claves: 'seguro perder datos fallo falla vuelta atras firma copia luz apagon',
      a: `<p>No. Cada actualización:</p>
<ol><li>Solo se acepta si lleva la <strong>firma digital</strong> del autor.</li>
<li>Se comprueba antes de aplicarla.</li>
<li>Hace una <strong>copia de la base de datos</strong> antes de cambiar nada.</li>
<li>Se vigila un minuto: si falla, <strong>vuelve sola a la versión anterior</strong> y restaura la copia.</li></ol>
<p>Si se va la luz a mitad, al volver a arrancar se retoma o se repite desde el principio.</p>` },
    { id: 'no-actualiza', cat: 'actualizaciones', q: 'No me aparecen las actualizaciones. ¿Qué hago?',
      ejemplos: ['no se actualiza', 'no puede actualizarse solo', 'error al actualizar', 'sigue en la version vieja'],
      claves: 'no actualiza error supervisor internet npm start docker version vieja',
      a: `<ul><li>Comprueba que el equipo tiene salida a internet.</li>
<li>En el servidor, arráncalo con <code>npm start</code> o Docker (usan el supervisor que aplica las actualizaciones). Con otro método la pantalla avisa de que no puede actualizarse.</li>
<li>En Windows, 7Factura debe estar abierto. También puedes descargar el último instalador y ejecutarlo encima: tus datos no se tocan.</li>
<li>Mira el mensaje de <span class="ruta">Ajustes → Actualizaciones</span>.</li></ul>` },

    // ---------------- Usuarios ----------------
    { id: 'usuarios', cat: 'usuarios', q: '¿Pueden usarlo varias personas, cada una con su usuario?',
      ejemplos: ['añadir empleado', 'crear usuario', 'mi gestor', 'permisos', 'administrador', 'varios usuarios'],
      claves: 'usuario usuarios empleado gestor permisos rol administrador varias personas',
      a: `<p>Sí, en <span class="ruta">Ajustes → Usuarios</span>, con rol de <strong>administrador</strong> o <strong>usuario</strong>. Cada uno conecta su propio correo. Para que trabajen desde varios equipos a la vez, usa la versión de servidor.</p>` },
    { id: 'olvide-contrasena', cat: 'usuarios', q: 'He olvidado mi contraseña. ¿Cómo entro?',
      ejemplos: ['no puedo entrar', 'recuperar contraseña', 'cuenta bloqueada', 'clave olvidada', 'demasiados intentos'],
      claves: 'contraseña password clave olvidada recuperar entrar acceso bloqueado intentos login',
      a: `<ul><li>Otro administrador puede cambiártela en <span class="ruta">Ajustes → Usuarios</span>.</li>
<li>Si te equivocas 5 veces seguidas, la cuenta se bloquea un rato por seguridad: espera unos minutos.</li>
<li>Si eres el único administrador, <a href="https://github.com/im7manu/7factura/issues">abre una incidencia</a> y te indicamos cómo restablecerla.</li></ul>` },
    { id: 'movil', cat: 'usuarios', q: '¿Puedo usarlo desde el móvil o la tableta?',
      ejemplos: ['usar en el iphone', 'android', 'app movil', 'desde la tablet', 'en la furgoneta'],
      claves: 'movil telefono iphone android tablet tableta app',
      a: `<p>Con la <strong>versión de servidor</strong>, sí: desde el navegador de cualquier móvil o tableta con acceso al servidor; la pantalla se adapta. La versión de Windows solo se usa desde el ordenador donde está instalada.</p>
<figure class="movil"><img src="capturas/23-movil.jpg" loading="lazy" alt="7Factura en el móvil"><figcaption>7Factura en el móvil.</figcaption></figure>` },
    { id: 'acceso-fuera', cat: 'usuarios', v: 'srv', q: '¿Puedo usarlo fuera de la oficina o desde casa?',
      ejemplos: ['acceso remoto', 'desde internet', 'teletrabajo', 'vpn', 'https', 'dominio propio'],
      claves: 'fuera remoto casa internet vpn https tailscale proxy dominio teletrabajo',
      a: `<p>Con la versión de servidor, publícalo detrás de <strong>HTTPS</strong> (con un proxy como Caddy o Nginx) o usa una <strong>VPN</strong> como Tailscale, e indica la dirección en <code>BASE_URL</code>. Detalles en la <a href="https://github.com/im7manu/7factura/blob/main/docs/instalacion.md">guía de instalación</a>.</p>` },
    { id: 'seguridad', cat: 'usuarios', q: '¿Es seguro? ¿Cómo protege mis datos?',
      ejemplos: ['contraseñas cifradas', 'hackers', 'proteccion', 'registro de actividad', 'quien ha hecho que'],
      claves: 'seguridad seguro proteccion cifrado contraseñas hacker actividad registro auditoria',
      a: `<ul><li>Contraseñas protegidas con scrypt (nunca se guardan en claro) y bloqueo tras varios intentos fallidos.</li>
<li>Credenciales de correo y certificados cifrados con AES-256-GCM.</li>
<li>Protección contra ataques web (CSRF, cabeceras de seguridad).</li>
<li>Actualizaciones y plugins verificados antes de instalarse.</li>
<li>Registro de actividad en <span class="ruta">Ajustes → Actividad</span>.</li></ul>
<p>Más información en <a href="https://github.com/im7manu/7factura/blob/main/docs/seguridad.md">Seguridad</a>.</p>` },

    // ---------------- Windows ----------------
    { id: 'windows-protegio', cat: 'windows', v: 'win', q: 'Windows dice «Windows protegió su PC» al instalar. ¿Es peligroso?',
      ejemplos: ['smartscreen', 'aviso de virus', 'no me deja instalar', 'editor desconocido', 'antivirus bloquea'],
      claves: 'smartscreen protegio aviso virus antivirus bloquea editor desconocido seguro firmado',
      a: `<p>No. Aparece porque el instalador no está firmado con un certificado de empresa de pago (es un proyecto gratuito). Pulsa <strong>Más información → Ejecutar de todas formas</strong>.</p>
<p>Si quieres comprobarlo, el código es público y cada versión publica la suma SHA-256 del instalador en su <a href="https://github.com/im7manu/7factura/releases/latest">página de GitHub</a>.</p>` },
    { id: 'windows-abrir-cerrar', cat: 'windows', v: 'win', q: '¿Cómo se abre y se cierra 7Factura en Windows?',
      ejemplos: ['donde esta el programa', 'se queda abierto en segundo plano', 'cerrar el programa', 'acceso directo', 'se abre en edge'],
      claves: 'abrir cerrar acceso directo escritorio inicio ventana edge segundo plano',
      a: `<p>Ábrelo con el acceso directo <strong>7Factura</strong> del escritorio o del menú Inicio: se abre en su propia ventana. Al <strong>cerrar la ventana</strong>, 7Factura se para del todo; no se queda nada funcionando en segundo plano.</p>
<p>Si no tienes Edge ni Chrome, se abre en tu navegador y aparece un aviso: déjalo abierto mientras lo uses.</p>` },
    { id: 'windows-no-arranca', cat: 'windows', v: 'win', q: 'Sale «7Factura no ha podido arrancar». ¿Qué hago?',
      ejemplos: ['no abre', 'error al abrir', 'no funciona', 'pantalla en blanco', 'se cierra solo'],
      claves: 'no arranca no abre error falla blanco registro log antivirus',
      a: `<ol><li>Cierra todas las ventanas de 7Factura y vuelve a abrirlo.</li>
<li>Si un antivirus ha bloqueado <code>node.exe</code>, añade una excepción para <code>%LOCALAPPDATA%\\Programs\\Facturador</code>.</li>
<li>Mira el final del archivo <code>%LOCALAPPDATA%\\Facturador\\registro.log</code> y, si no lo entiendes, <a href="https://github.com/im7manu/7factura/issues">abre una incidencia</a> adjuntándolo.</li>
<li>Reinstalar no borra tus datos.</li></ol>` },
    { id: 'windows-desinstalar', cat: 'windows', v: 'win', q: '¿Cómo desinstalo 7Factura? ¿Se borran mis datos?',
      ejemplos: ['quitar el programa', 'eliminar facturador', 'reinstalar', 'borrar todo'],
      claves: 'desinstalar eliminar quitar reinstalar borrar datos',
      a: `<p>Desde <span class="ruta">Configuración → Aplicaciones → 7Factura → Desinstalar</span>. Al final te pregunta si quieres borrar también tus datos: <strong>por defecto se conservan</strong> y vuelven a aparecer si lo instalas de nuevo.</p>` },

    // ---------------- General ----------------
    { id: 'precio', cat: 'general', q: '¿Cuánto cuesta? ¿Hay alguna versión de pago?',
      ejemplos: ['es gratis', 'precio', 'suscripcion', 'licencia', 'cuota mensual', 'uso comercial'],
      claves: 'gratis gratuito precio coste pagar suscripcion licencia cuota comercial premium',
      a: `<p><strong>Es gratis, siempre</strong>, también para uso comercial. No hay versiones de pago, ni suscripciones, ni funciones premium. Es software libre con licencia MIT.</p>` },
    { id: 'codigo-abierto', cat: 'general', q: '¿Qué significa que es de código abierto? ¿De quién es?',
      ejemplos: ['open source', 'github', 'quien lo ha hecho', 'puedo modificarlo', 'licencia mit'],
      claves: 'codigo abierto open source libre mit github autor modificar',
      a: `<p>Que todo el código es público y cualquiera puede revisarlo, usarlo, copiarlo y modificarlo libremente (licencia MIT). Está escrito desde cero y todo está en GitHub:</p>
<ul><li><a href="https://github.com/im7manu/7factura">github.com/im7manu/7factura</a>: el programa.</li>
<li><a href="https://github.com/im7manu/7factura-plugins">github.com/im7manu/7factura-plugins</a>: los plugins oficiales.</li></ul>` },
    { id: 'internet', cat: 'general', q: '¿Necesito internet para usar 7Factura?',
      ejemplos: ['funciona sin conexion', 'offline', 'sin wifi'],
      claves: 'internet conexion offline wifi sin red',
      a: `<p>No. Solo lo usa para enviar correos, buscar actualizaciones e instalar plugins.</p>` },
    { id: 'privacidad', cat: 'general', q: '¿Mis datos se suben a la nube? ¿Cumple el RGPD?',
      ejemplos: ['proteccion de datos', 'lopd', 'quien ve mis facturas', 'privacidad', 'datos de mis clientes'],
      claves: 'rgpd lopd proteccion datos privacidad nube terceros clientes responsable',
      a: `<p>No se sube nada. 7Factura se ejecuta en tu equipo y guarda todo allí: ni el autor ni nadie más tiene acceso. No hay cuentas, publicidad ni estadísticas de uso.</p>
<p>Respecto al RGPD, <strong>tú eres el responsable</strong> de los datos de tus clientes y 7Factura no actúa como encargado del tratamiento, porque no recibe ningún dato. Tienes que proteger tu equipo, hacer copias y cumplir tus propias obligaciones (informar a tus clientes, etc.). Más detalles en la <a href="privacidad.html">política de privacidad</a>.</p>` },
    { id: 'soporte', cat: 'general', q: '¿Dónde pido ayuda o aviso de un error?',
      ejemplos: ['contactar', 'soporte tecnico', 'tengo un problema', 'sugerir una mejora', 'reportar un fallo'],
      claves: 'ayuda soporte contacto error fallo problema mejora sugerencia incidencia',
      a: `<p>Abre una <a href="https://github.com/im7manu/7factura/issues">incidencia en GitHub</a> explicando qué pasa (sin incluir datos de tus clientes). También puedes consultar el <a href="manual-facturador.pdf">manual en PDF</a>.</p>` },
  ],
};
