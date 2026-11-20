// Genera el manual de uso en PDF: public/manual-facturador.pdf (se sirve en /manual-facturador.pdf).
// Uso: node scripts/generar-manual.mjs   (las capturas están en docs/manual/capturas/)
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve('.');
const version = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).version;
const capturas = path.join(raiz, 'docs', 'manual', 'capturas');
const salida = path.join(raiz, 'public', 'manual-facturador.pdf');

const AZUL = '#0F6CBD';
const OSCURO = '#1B1B1B';
const GRIS = '#5E5E5E';
const SUAVE = '#EBF3FC';
const VERDE = '#107C10';

// ---------------- Contenido ----------------
// Bloques: { p }, { h }, { lista: [] }, { img, pie }, { nota, titulo, color }, { pasos: [] }, { tabla: [[a, b]] }
const CAPITULOS = [
  {
    titulo: 'Tus datos están en tu servidor',
    destacado: true,
    bloques: [
      { p: '7Factura se instala y se ejecuta en el servidor de tu empresa o en el ordenador que la aloje (por ejemplo, un pequeño servidor en la oficina o un NAS). No es un servicio en la nube: no hay ninguna cuenta en internet ni ninguna empresa externa que guarde tu información.' },
      { nota: 'Nada de tu información se sube a la nube. Las facturas, los clientes, los cobros, los adjuntos, las copias de seguridad y las contraseñas se guardan únicamente en la carpeta «data» del equipo donde está instalado 7Factura.', titulo: 'En resumen', color: VERDE },
      { h: 'Qué se guarda y dónde' },
      { lista: [
        'Base de datos (facturas, presupuestos, clientes, proveedores, cobros, usuarios…): data/facturador.db.',
        'Archivos adjuntos y firmas de albaranes: data/adjuntos/.',
        'Configuración de los plugins (temas, diseños de PDF, certificado digital…): data/plugins-datos/.',
        'Copias de seguridad: data/plugins-datos/copias/ (y donde tú decidas guardar las que descargues).',
        'Clave de cifrado de las credenciales: data/secreto.key.',
      ] },
      { h: 'Cuándo se conecta a internet (y qué envía)' },
      { p: '7Factura funciona sin conexión. Solo usa internet en estos casos, y nunca envía tus datos de negocio a terceros:' },
      { lista: [
        'Buscar actualizaciones: una vez por hora pregunta a GitHub (github.com/im7manu/facturador) si hay una versión nueva. No envía ningún dato de tu empresa; solo descarga la versión nueva si la instalas.',
        'Plugins: al abrir la página Plugins consulta la lista de plugins disponibles en GitHub, y descarga el que instales.',
        'Correo: cuando tú envías un documento por correo, el mensaje sale por tu propia cuenta (Gmail, Outlook o tu proveedor por SMTP), igual que cualquier correo que envíes desde tu buzón.',
      ] },
      { p: 'No hay estadísticas de uso, publicidad, rastreo ni conexiones ocultas. El código es abierto (licencia MIT): cualquiera puede revisarlo.' },
      { h: 'Tu responsabilidad: las copias' },
      { p: 'Como los datos solo están en tu equipo, si ese equipo se estropea se pierden con él. Activa el plugin «Copias de seguridad», descarga las copias y guárdalas en otro sitio seguro (un disco externo, la nube de la empresa…). Ver el capítulo «Copias de seguridad».' },
    ],
  },
  {
    titulo: 'Primeros pasos',
    bloques: [
      { h: 'Requisitos' },
      { lista: [
        'Un ordenador o servidor encendido mientras se use la aplicación (Windows, macOS o Linux).',
        'Node.js 22 o superior (nodejs.org, versión LTS), o Docker.',
        'Cualquier navegador moderno en los equipos que vayan a usarla (también móviles y tabletas).',
      ] },
      { h: 'Instalación' },
      { pasos: [
        'Descarga la última versión desde github.com/im7manu/facturador (apartado Releases) y descomprímela.',
        'En una terminal, dentro de la carpeta, ejecuta «npm start» (el paquete ya incluye todo lo necesario). Con Docker: «docker compose up -d --build».',
        'Abre en el navegador http://localhost:9100 (o la dirección del servidor desde otros equipos de la red).',
      ] },
      { p: '«npm start» arranca 7Factura con su supervisor, que la vuelve a arrancar si se para y aplica las actualizaciones de forma segura.' },
      { h: 'Primera configuración' },
      { p: 'La primera vez se abre un asistente de dos pasos: crea la cuenta de administrador (contraseña de al menos 10 caracteres con mayúsculas, minúsculas, números y un símbolo) e introduce los datos de tu empresa (razón social, NIF, dirección, IBAN y el texto legal del pie de las facturas). Todo se puede cambiar después en Ajustes.' },
      { img: '01-acceso', pie: 'Pantalla de inicio de sesión (con las fotos de la empresa del plugin Temas).' },
      { h: 'Acceso desde otros equipos y desde fuera de la oficina' },
      { p: 'Desde la red de la empresa basta con abrir http://IP-DEL-SERVIDOR:9100. Para acceder desde fuera, publícalo detrás de HTTPS (por ejemplo con un proxy como Caddy o Nginx, o una VPN como Tailscale) e indica la dirección en la variable BASE_URL.' },
    ],
  },
  {
    titulo: 'La pantalla principal',
    bloques: [
      { p: 'El inicio muestra de un vistazo cómo va el año: lo facturado (base imponible), el trimestre en curso con su IVA, lo pendiente de cobro y las facturas vencidas. Cada mosaico es un acceso directo.' },
      { img: '02-inicio', pie: 'Inicio: mosaicos, avisos de cobro, gráfico mensual y últimas facturas.' },
      { lista: [
        'Barra superior: botón «Nueva factura», campana de avisos (cobros que vencen, impagados y pagos a proveedores), modo claro u oscuro y tu cuenta.',
        'Menú lateral por secciones (Ventas, Compras, Datos y General), que se pueden plegar. El botón de la flecha lo deja solo con iconos.',
        'En el móvil el menú se abre con el botón de la esquina superior izquierda.',
      ] },
      { img: '23-movil', pie: 'También funciona en el móvil.', ancho: 170 },
    ],
  },
  {
    titulo: 'Clientes, proveedores, productos y vehículos',
    bloques: [
      { h: 'Clientes y proveedores' },
      { p: 'Ficha con nombre, NIF (se comprueba que es válido), dirección, email, forma de pago habitual y notas. También puedes indicar:' },
      { lista: [
        'IVA habitual: por ejemplo exportación o entrega intracomunitaria, para que se aplique al hacer sus documentos.',
        'Recargo de equivalencia (comerciantes minoristas): se calcula solo en sus líneas.',
        'Condiciones de pago propias: plazos (30-60-90…) y días fijos de pago (por ejemplo, días 10 y 25).',
      ] },
      { img: '14-clientes', pie: 'Listado de clientes con sus facturas y lo pendiente de cobro.' },
      { h: 'Productos y servicios' },
      { p: 'Conceptos habituales con su precio e IVA para rellenar las líneas más rápido (por ejemplo «Porte Madrid - Valencia» u «Hora de espera»).' },
      { h: 'Vehículos y conductores' },
      { p: 'Flota con matrícula, tipo, modelo, estado y fecha de la ITV (avisa si está caducada), y el gasto del año de cada vehículo. Usa los mismos datos que 7DeCA para que en el futuro las dos aplicaciones compartan la lista.' },
      { img: '12-vehiculos', pie: 'Vehículos con su ITV y su gasto anual.' },
    ],
  },
  {
    titulo: 'Facturas',
    bloques: [
      { p: 'Una factura se crea como borrador, se emite y después se cobra. Mientras es borrador se puede cambiar todo; al emitirla recibe su número y ya no se puede modificar ni borrar (así lo exige la normativa).' },
      { img: '06-nueva-factura', pie: 'Nueva factura: cliente, serie, fechas, forma de pago, referencia y líneas.' },
      { h: 'Las líneas' },
      { lista: [
        'Concepto (desde el catálogo o escrito a mano), cantidad, precio y descuento.',
        'Impuesto: IVA al 21, 10, 4 o 0 %, o una operación sin IVA: exenta (con su artículo legal), exportación, entrega intracomunitaria, inversión del sujeto pasivo, no sujeta… El PDF incluye la leyenda legal correspondiente.',
        'Suplido: gasto pagado en nombre del cliente (peajes, tasas…). No forma parte de la base imponible pero se suma al total.',
        'IRPF: retención del 1, 2, 7, 15 o 19 %.',
      ] },
      { h: 'Emitir, numeración y rectificativas' },
      { lista: [
        'Al emitir, la factura recibe el siguiente número de su serie con el formato que elijas (por ejemplo 31/2026). No se puede emitir con una fecha anterior a la última factura de la serie.',
        'Cada factura emitida guarda una huella de integridad encadenada con la anterior, que permite detectar cualquier modificación.',
        'Para corregir una factura emitida se crea una rectificativa (serie R) con el motivo; nace con las líneas en negativo y se ajusta antes de emitirla.',
        'Serie de facturas simplificadas (S) para ventas sin datos completos del cliente.',
      ] },
      { img: '04-factura', pie: 'Factura emitida: vencimientos y cobros, adjuntos, correos enviados y huella de integridad.' },
      { h: 'Otras acciones' },
      { lista: [
        'PDF: verlo o descargarlo, también «sin valorar» (sin precios).',
        'Duplicar: crea un borrador igual con la fecha de hoy.',
        'Adjuntos: arrastra albaranes firmados, justificantes, fotos… (hasta 15 MB).',
        'Enviar por correo (ver capítulo «Correo»).',
      ] },
    ],
  },
  {
    titulo: 'Presupuestos, proformas, pedidos y albaranes',
    bloques: [
      { p: 'Todos funcionan igual que las facturas (borrador, emitir, PDF, correo, adjuntos) y se pueden convertir unos en otros con «Convertir en…»: presupuesto → pedido → albarán → factura, o saltando pasos. Cada documento muestra de dónde viene y en qué continúa.' },
      { img: '07-presupuesto', pie: 'Presupuesto emitido con sus acciones: aceptar, rechazar o convertir.' },
      { h: 'Proformas' },
      { p: 'Documento previo a la factura, con su propia numeración (PF1/2026). No es una factura: no cuenta para el IVA ni para los informes. Con «Crear factura» se convierte en una.' },
      { h: 'Albaranes' },
      { lista: [
        'Valorados (con precios) o sin valorar: se elige en cada albarán.',
        'Firma del receptor: con «Firmar», quien recibe la mercancía firma con el dedo en el móvil o la tableta e indica su nombre y DNI. La firma se imprime en el PDF («Recibí conforme»). Sin firmar, el recuadro sale en blanco para firmarlo en papel.',
        'Facturar varios albaranes juntos: márcalos en el listado y pulsa «Facturar juntos».',
      ] },
      { img: '08-albaran', pie: 'Albarán firmado por el receptor.' },
      { h: 'Facturar el mes' },
      { p: 'En Albaranes, «Facturar el mes» crea una factura por cliente con todos sus albaranes pendientes del mes elegido. Puedes revisarlas como borrador o emitirlas directamente. Un albarán nunca se factura dos veces.' },
      { img: '09-facturar-mes', pie: 'Facturar el mes: una factura por cliente.' },
    ],
  },
  {
    titulo: 'Cobros',
    bloques: [
      { p: 'Al emitir una factura se crean sus vencimientos (recibos) según los plazos del cliente o de la forma de pago. Cada cobro se apunta con su fecha, importe y forma de pago, y puede ser parcial. La factura pasa sola a «Cobrada» cuando está pagada entera.' },
      { img: '10-cobros', pie: 'Listado de cobros pendientes, vencidos y cobrados.' },
      { lista: [
        'Panel «Vencimientos y cobros» dentro de cada factura: cobrar, anular un cobro, editar los vencimientos.',
        'Avisos en la campana y en el inicio: recibos que vencen en N días e impagados desde hace X días.',
        'Todo es configurable en Ajustes > Cobros: plazos, cobros parciales, menú, avisos…',
      ] },
    ],
  },
  {
    titulo: 'Compras y gastos',
    bloques: [
      { lista: [
        'Facturas recibidas: se registran con el número de factura del proveedor y un número interno correlativo (FC1/2026). Avisa si esa factura ya está registrada. Generan sus pagos.',
        'Gastos y tickets (gasolina, peajes, parking…): el proveedor es opcional y se dan por pagados al registrarlos.',
        'IVA deducible: indica si el IVA de cada factura o gasto cuenta como soportado en el modelo 303.',
        'Pedidos y albaranes de proveedor, con el mismo circuito que en ventas.',
        'Vehículo en cada línea: para saber cuánto cuesta cada camión.',
        'Pagos: listado de lo que hay que pagar a proveedores, con avisos.',
      ] },
      { img: '11-compra', pie: 'Factura recibida con el número del proveedor, IVA deducible y vehículo por línea.' },
    ],
  },
  {
    titulo: 'Correo',
    bloques: [
      { p: 'Cada documento emitido tiene el botón «Enviar por correo», que abre una ventana de correo con el destinatario (el email del cliente o proveedor), el asunto y el texto de la plantilla de ese tipo de documento, y el PDF adjunto. Todo se puede cambiar antes de enviar.' },
      { img: '05-correo', pie: 'Enviar una factura por correo.' },
      { lista: [
        'Cada usuario conecta su propia cuenta en Ajustes > Correo: Google (Gmail o Workspace), Microsoft 365 (Outlook o Exchange) u otro proveedor por SMTP. El correo sale desde su buzón y queda también en su carpeta de enviados.',
        'Las plantillas (asunto y texto) se editan por tipo de documento, con variables como {cliente}, {numero}, {total} o {vencimiento}.',
        'Queda registrado qué se envió, a quién y cuándo, en cada documento.',
        'Las credenciales se guardan cifradas y nunca se muestran.',
      ] },
      { img: '17-ajustes-correo', pie: 'Ajustes > Correo: cuenta del usuario y aplicaciones de Google y Microsoft.' },
    ],
  },
  {
    titulo: 'Informes',
    bloques: [
      { p: 'Datos de referencia para tus declaraciones (revísalos siempre con tu gestoría):' },
      { lista: [
        'Resumen del IVA por trimestre (modelo 303): repercutido, soportado deducible y resultado (a ingresar o a compensar).',
        'Clientes y proveedores por encima de 3.005,06 € (modelo 347), por trimestres.',
        'Gasto por vehículo.',
      ] },
      { img: '13-informes', pie: 'Informes del ejercicio.' },
    ],
  },
  {
    titulo: 'Ajustes',
    bloques: [
      { tabla: [
        ['Mi empresa', 'Datos fiscales, dirección, IBAN y texto del pie de los documentos.'],
        ['Series y formas de pago', 'Series de factura con su formato de numeración ({num}/{año} → 31/2026), formatos de presupuestos y proformas, formas de pago con sus plazos.'],
        ['Ventas', 'Usar pedidos y albaranes, albarán valorado por defecto, indicar el albarán en las facturas, emitir al facturar el mes.'],
        ['Compras', 'Gastos, pedidos y albaranes de proveedor, IVA deducible por defecto, vehículos, menú de pagos.'],
        ['Cobros', 'Plazos, cobros parciales, menú de cobros, panel en la factura, vencimientos en el PDF y avisos.'],
        ['Correo', 'Tu cuenta de correo, aplicaciones de Google y Microsoft (administrador) y plantillas.'],
        ['Usuarios', 'Usuarios con rol de administrador o usuario; activar, desactivar y cambiar contraseñas.'],
        ['Actualizaciones', 'Versión instalada, versión nueva disponible y actualización automática.'],
        ['Actividad', 'Registro de todo lo importante (accesos, emisiones, cambios de ajustes…) con su nivel de gravedad.'],
      ] },
      { img: '15-ajustes-series', pie: 'Series de facturación y formatos de numeración.' },
    ],
  },
  {
    titulo: 'Plugins',
    bloques: [
      { p: 'Los plugins añaden funciones sin tocar la aplicación. Los instala un administrador desde la página Plugins, que muestra los disponibles en el repositorio oficial de GitHub; también se pueden instalar desde un archivo. Cada descarga se verifica con su huella SHA-256.' },
      { img: '19-plugins', pie: 'Página de plugins.' },
      { h: 'Copias de seguridad' },
      { p: 'Copia automática semanal y bajo demanda de todos los datos, descargable en ZIP, y restauración. Ver el capítulo siguiente.' },
      { h: 'Temas' },
      { p: 'El administrador elige el aspecto de toda la aplicación: Metro, 7DeCA, Frutiger Aero, Windows clásico, Alto contraste o Nórdico, o temas propios importados en JSON. Cambia colores (claro y oscuro), tipografía, forma, transparencias, menú lateral o superior e iconos. También permite subir fotos de la empresa para la pantalla de inicio de sesión, que van rotando.' },
      { img: '21-temas', pie: 'Plugin Temas.' },
      { h: 'Diseño de PDF' },
      { lista: [
        'Cinco plantillas (Moderna, Clásica, Minimalista, Banda lateral y Compacta), colores, tipografía (también fuentes propias), logo, columnas, títulos, textos de cabecera, condiciones y pie, y marca de agua.',
        'Diseños distintos por tipo de documento o serie.',
        'Firma en el pie: imagen de la firma manuscrita o del sello.',
        'Firma digital con certificado (por ejemplo el de la FNMT, .p12 o .pfx), verificable en Adobe y otros lectores. El certificado se guarda cifrado.',
      ] },
      { img: '22-diseno-pdf', pie: 'Plugin Diseño de PDF con vista previa en vivo.' },
    ],
  },
  {
    titulo: 'Copias de seguridad',
    bloques: [
      { p: 'Con el plugin «Copias de seguridad» se hace una copia automática cada semana (por defecto, el lunes a las 3:00; si el equipo estaba apagado, al volver a arrancar) y puedes hacer una cuando quieras con «Hacer una copia ahora».' },
      { img: '20-copias', pie: 'Copias de seguridad: descargar, restaurar y programar.' },
      { nota: 'Descarga las copias en ZIP y guárdalas fuera del servidor. El ZIP contiene todos los datos de la empresa: guárdalo en un sitio seguro.', titulo: 'Importante', color: '#BC4B09' },
      { h: 'Restaurar' },
      { p: 'Desde una copia del servidor o subiendo un ZIP. Antes de restaurar, lo que hay se guarda en data/antes-de-restaurar-<fecha> por si hay que volver atrás. La aplicación se reinicia sola.' },
      { h: 'Copia manual' },
      { p: 'También puedes copiar la carpeta «data» entera con la aplicación parada. Incluye siempre el archivo secreto.key: sin él no se pueden leer las credenciales de correo guardadas.' },
    ],
  },
  {
    titulo: 'Actualizaciones',
    bloques: [
      { p: '7Factura comprueba cada hora si hay una versión nueva publicada en github.com/im7manu/facturador. El administrador la ve en Ajustes > Actualizaciones y con un aviso en la barra superior, y puede instalarla con un clic o dejar activada la actualización automática de madrugada.' },
      { img: '18-actualizaciones', pie: 'Ajustes > Actualizaciones.' },
      { h: 'Por qué es segura' },
      { pasos: [
        'Solo se aceptan paquetes con la firma digital del autor: aunque alguien manipulara la descarga, la aplicación la rechazaría.',
        'Se comprueba que el paquete es 7Factura, que la versión es más nueva, que el código no tiene errores y que la versión de Node del servidor es suficiente.',
        'Se hace una copia de la base de datos antes de cambiar nada. La carpeta «data» nunca se borra.',
        'La versión nueva se vigila durante un minuto. Si se cae o no responde, se vuelve sola a la versión anterior y se restaura la copia de la base de datos.',
      ] },
      { p: 'Para que se pueda actualizar, la aplicación debe arrancarse con «npm start» o con Docker (que usan el supervisor).' },
    ],
  },
  {
    titulo: 'Seguridad',
    bloques: [
      { lista: [
        'Contraseñas protegidas con scrypt (no se guardan nunca en claro) y política de contraseñas robustas.',
        'Bloqueo temporal tras 5 intentos fallidos por cuenta y tras 10 por dirección IP.',
        'Sesiones con cookie HttpOnly y SameSite estricto; protección contra peticiones desde otras webs (CSRF) y cabeceras de seguridad (CSP, HSTS…).',
        'Credenciales de correo y certificados cifrados con AES-256-GCM.',
        'Adjuntos aislados: solo tipos permitidos, sin rutas peligrosas.',
        'Registro de actividad con niveles de gravedad (Ajustes > Actividad).',
        'Actualizaciones y plugins verificados antes de instalarse.',
      ] },
      { p: 'Recomendaciones: publica la aplicación solo detrás de HTTPS si se accede desde fuera de la oficina, usa contraseñas distintas para cada usuario, da el rol de administrador solo a quien lo necesite y guarda las copias fuera del servidor.' },
    ],
  },
  {
    titulo: 'Preguntas frecuentes',
    bloques: [
      { h: '¿Necesito internet para usar 7Factura?' },
      { p: 'No. Solo para enviar correos, buscar actualizaciones e instalar plugins.' },
      { h: '¿Puedo usarlo desde el móvil?' },
      { p: 'Sí, desde el navegador de cualquier dispositivo con acceso al servidor. La pantalla se adapta.' },
      { h: 'Me he equivocado en una factura emitida. ¿Cómo la corrijo?' },
      { p: 'Con «Rectificar»: se crea una factura rectificativa con el motivo. Las facturas emitidas no se pueden modificar ni borrar.' },
      { h: '¿Cumple con VERI*FACTU?' },
      { p: '7Factura ya guarda una huella de integridad encadenada en cada factura y clasifica el IVA con los mismos códigos que VERI*FACTU, pero todavía no genera ni envía los registros a la Agencia Tributaria. Se añadirá antes de que sea obligatorio.' },
      { h: 'He perdido el servidor. ¿Qué hago?' },
      { p: 'Instala 7Factura en otro equipo, instala el plugin de copias y restaura el último ZIP que descargaste.' },
      { h: '¿De quién es el programa?' },
      { p: '7Factura es software libre con licencia MIT, escrito desde cero. Puedes usarlo, copiarlo y modificarlo libremente. El código está en github.com/im7manu/facturador.' },
    ],
  },
];

// ---------------- Maquetación ----------------
const pdf = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: 60, right: 60 }, bufferPages: true,
  info: { Title: '7Factura - Manual de uso', Author: '7Factura', Subject: `Manual de uso de 7Factura ${version}` } });
fs.mkdirSync(path.dirname(salida), { recursive: true });
pdf.pipe(fs.createWriteStream(salida));
const W = pdf.page.width;
const H = pdf.page.height;
const X = 60;
const ANCHO = W - 120;
const indice = [];

const saltoSiHaceFalta = (alto) => { if (pdf.y + alto > H - 70) pdf.addPage(); };

// Portada (sin margen inferior para que los textos del pie no abran otra página)
pdf.page.margins.bottom = 0;
pdf.rect(0, 0, W, H).fill(AZUL);
const grid = [[60, 300, 190, 120, 0.18], [260, 300, 120, 120, 0.28], [60, 430, 120, 120, 0.12], [190, 430, 190, 120, 0.22], [60, 560, 320, 90, 0.14]];
for (const [x, y, w, h, o] of grid) pdf.save().fillOpacity(o).rect(x, y, w, h).fill('#FFFFFF').restore();
pdf.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(40).text('7Factura', 60, 120);
pdf.font('Helvetica').fontSize(20).text('Manual de uso', 60, 172);
pdf.fontSize(11).fillOpacity(0.9).text(`Versión ${version}`, 60, 204).fillOpacity(1);
pdf.font('Helvetica-Bold').fontSize(12).text('Facturación para autónomos y pymes.', 60, 690);
pdf.font('Helvetica').fontSize(11).text('Se ejecuta en el servidor de tu empresa. Tus datos no salen de él.', 60, 708, { width: ANCHO });
pdf.fontSize(9).fillOpacity(0.8).text('Software libre (licencia MIT) · github.com/im7manu/facturador', 60, 770).fillOpacity(1);

// Página del índice (se rellena al final)
pdf.addPage();
const paginaIndice = pdf.bufferedPageRange().count - 1;

function bloque(b) {
  if (b.p) {
    pdf.font('Helvetica').fontSize(10.5).fillColor(OSCURO).text(b.p, X, pdf.y, { width: ANCHO, lineGap: 2.5, align: 'left' });
    pdf.moveDown(0.6);
  } else if (b.h) {
    saltoSiHaceFalta(60);
    pdf.moveDown(0.3);
    pdf.font('Helvetica-Bold').fontSize(13).fillColor(AZUL).text(b.h, X, pdf.y, { width: ANCHO });
    pdf.moveDown(0.3);
  } else if (b.lista || b.pasos) {
    const items = b.lista || b.pasos;
    items.forEach((t, i) => {
      pdf.font('Helvetica').fontSize(10.5);
      saltoSiHaceFalta(pdf.heightOfString(t, { width: ANCHO - 20 }) + 6);
      const y0 = pdf.y;
      if (b.pasos) {
        pdf.circle(X + 7, y0 + 6, 7).fill(AZUL);
        pdf.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF').text(String(i + 1), X, y0 + 2.5, { width: 14, align: 'center' });
      } else {
        pdf.circle(X + 4, y0 + 6, 2.2).fill(AZUL);
      }
      pdf.font('Helvetica').fontSize(10.5).fillColor(OSCURO).text(t, X + 20, y0, { width: ANCHO - 20, lineGap: 2.5 });
      pdf.moveDown(0.35);
    });
    pdf.moveDown(0.3);
  } else if (b.nota) {
    pdf.font('Helvetica').fontSize(10.5);
    const alto = pdf.heightOfString(b.nota, { width: ANCHO - 36, lineGap: 2.5 }) + 40;
    saltoSiHaceFalta(alto + 10);
    const y0 = pdf.y;
    pdf.save().fillOpacity(0.08).rect(X, y0, ANCHO, alto).fill(b.color || AZUL).restore();
    pdf.rect(X, y0, 4, alto).fill(b.color || AZUL);
    pdf.font('Helvetica-Bold').fontSize(11).fillColor(b.color || AZUL).text(b.titulo || 'Nota', X + 18, y0 + 12, { width: ANCHO - 36 });
    pdf.font('Helvetica').fontSize(10.5).fillColor(OSCURO).text(b.nota, X + 18, pdf.y + 3, { width: ANCHO - 36, lineGap: 2.5 });
    pdf.y = y0 + alto + 12;
  } else if (b.img) {
    const ruta = path.join(capturas, `${b.img}.jpg`);
    if (!fs.existsSync(ruta)) return;
    const img = pdf.openImage(ruta);
    const ancho = b.ancho || ANCHO;
    const alto = (img.height / img.width) * ancho;
    saltoSiHaceFalta(alto + 34);
    const x = X + (ANCHO - ancho) / 2;
    const y0 = pdf.y + 2;
    pdf.image(img, x, y0, { width: ancho });
    pdf.rect(x, y0, ancho, alto).lineWidth(0.6).strokeColor('#D0D0D0').stroke();
    pdf.font('Helvetica-Oblique').fontSize(8.5).fillColor(GRIS).text(b.pie || '', X, y0 + alto + 5, { width: ANCHO, align: 'center' });
    pdf.y = y0 + alto + 24;
  } else if (b.tabla) {
    for (const [a, t] of b.tabla) {
      pdf.font('Helvetica').fontSize(10);
      const alto = Math.max(pdf.heightOfString(t, { width: ANCHO - 150 }), 12) + 12;
      saltoSiHaceFalta(alto);
      const y0 = pdf.y;
      pdf.font('Helvetica-Bold').fontSize(10).fillColor(OSCURO).text(a, X, y0 + 6, { width: 140 });
      pdf.font('Helvetica').fontSize(10).fillColor(OSCURO).text(t, X + 150, y0 + 6, { width: ANCHO - 150, lineGap: 1.5 });
      pdf.y = y0 + alto;
      pdf.moveTo(X, pdf.y).lineTo(X + ANCHO, pdf.y).lineWidth(0.5).strokeColor('#E0E0E0').stroke();
    }
    pdf.moveDown(0.8);
  }
}

CAPITULOS.forEach((cap, n) => {
  pdf.addPage();
  indice.push({ titulo: cap.titulo, pagina: pdf.bufferedPageRange().count, destacado: cap.destacado });
  // Cabecera del capítulo
  pdf.rect(0, 0, W, 6).fill(AZUL);
  pdf.font('Helvetica-Bold').fontSize(10).fillColor(AZUL).text(`CAPÍTULO ${n + 1}`, X, 56);
  pdf.font('Helvetica-Bold').fontSize(24).fillColor(OSCURO).text(cap.titulo, X, 72, { width: ANCHO });
  pdf.moveTo(X, pdf.y + 8).lineTo(X + 60, pdf.y + 8).lineWidth(3).strokeColor(AZUL).stroke();
  pdf.y += 26;
  for (const b of cap.bloques) bloque(b);
});

// Índice
pdf.switchToPage(paginaIndice);
pdf.rect(0, 0, W, 6).fill(AZUL);
pdf.font('Helvetica-Bold').fontSize(24).fillColor(OSCURO).text('Índice', X, 72);
let yi = 128;
indice.forEach((e, i) => {
  pdf.font(e.destacado ? 'Helvetica-Bold' : 'Helvetica').fontSize(12).fillColor(e.destacado ? VERDE : OSCURO)
    .text(`${i + 1}. ${e.titulo}`, X, yi, { width: ANCHO - 40, goTo: undefined });
  pdf.fillColor(GRIS).text(String(e.pagina), X + ANCHO - 40, yi, { width: 40, align: 'right' });
  pdf.moveTo(X, yi + 18).lineTo(X + ANCHO, yi + 18).lineWidth(0.4).strokeColor('#E6E6E6').stroke();
  yi += 26;
});
pdf.save().fillOpacity(0.08).rect(X, yi + 20, ANCHO, 74).fill(VERDE).restore();
pdf.rect(X, yi + 20, 4, 74).fill(VERDE);
pdf.font('Helvetica-Bold').fontSize(11).fillColor(VERDE).text('Tus datos no salen de tu servidor', X + 18, yi + 32, { width: ANCHO - 36 });
pdf.font('Helvetica').fontSize(10).fillColor(OSCURO).text('7Factura se ejecuta en el servidor o el ordenador de tu empresa y guarda toda la información allí. No se sube nada a la nube. Lee el capítulo 1 antes de empezar.', X + 18, pdf.y + 3, { width: ANCHO - 36, lineGap: 2 });

// Pie de página (salvo la portada)
const total = pdf.bufferedPageRange().count;
for (let i = 1; i < total; i++) {
  pdf.switchToPage(i);
  pdf.page.margins.bottom = 0;
  pdf.font('Helvetica').fontSize(8).fillColor(GRIS)
    .text(`7Factura ${version} · Manual de uso`, X, H - 40, { width: ANCHO / 2 })
    .text(`${i + 1} / ${total}`, X + ANCHO / 2, H - 40, { width: ANCHO / 2, align: 'right' });
}
pdf.end();
console.log(`Manual generado: ${path.relative(raiz, salida)} (${total} páginas)`);
