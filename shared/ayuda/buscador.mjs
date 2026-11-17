// Buscador del centro de ayuda. Lo comparten la web (web/ayuda.js) y la aplicación (src/components/ayuda).
// Funciona entero en el navegador: no envía nada a ningún sitio.
//
// Cómo entiende la búsqueda:
//  1. Normaliza (minúsculas, sin tildes) y quita palabras vacías («el», «como», «puedo»…).
//  2. Reduce cada palabra a su raíz («facturas», «facturar», «facturado» → «factur»).
//  3. Amplía con sinónimos y conceptos («borrar» también busca «eliminar», «anular», «rectificar»…).
//  4. Tolera faltas de ortografía (distancia de edición, con letras cambiadas de orden) y palabras a medio escribir.
//  5. Puntúa cada pregunta (BM25) por su título, por frases de ejemplo de cómo la haría la gente, por palabras clave
//     y por el texto de la respuesta, y premia las que cubren más partes de la búsqueda.

// ---------- Texto ----------
const VACIAS = new Set(('a al algo algun alguna algunas alguno algunos ante antes aqui asi aun bien cada como con cual cuales cuando cuanto de del desde donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estan estar estas este esto estos esta ha hace hacer hacerlo hay he hola la las le les lo los mas me mi mis mucho muy necesito ni no nos o os otra otro para pero poco por porque puede pueden puedo pues que quiero se sea ser si sin sobre solo son su sus tambien tan tener tengo ti tiene todo todos tu tus un una unas uno unos usted ya yo quiero saber gustaria favor facturador programa aplicacion app').split(' '));
export const normalizar = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ*]+/g, ' ').trim();
const SUFIJOS = ['aciones', 'iciones', 'amiento', 'imiento', 'adoras', 'adores', 'ciones', 'acion', 'icion', 'mente', 'ancia', 'encia', 'adora', 'ador',
  'ando', 'iendo', 'an', 'en', 'ados', 'idos', 'adas', 'idas', 'ado', 'ido', 'ada', 'ida', 'ces', 'ar', 'er', 'ir', 'es', 'as', 'os', 'is', 's', 'a', 'o', 'e'];
const raizCache = new Map();
export function raiz(p) {
  if (raizCache.has(p)) return raizCache.get(p);
  let r = p;
  if (!/^\d+$/.test(p) && p.length > 3) {
    for (const s of SUFIJOS) {
      if (r.endsWith(s) && r.length - s.length >= (s.length <= 2 ? 3 : 4)) { r = r.slice(0, -s.length); break; }
    }
  }
  raizCache.set(p, r);
  return r;
}
const palabras = (t) => normalizar(t).split(' ').filter((p) => p && !VACIAS.has(p) && (p.length > 1 || /\d/.test(p)));
const raices = (t) => palabras(t).map(raiz);

// ---------- Sinónimos y conceptos ----------
// Cada grupo une formas de decir lo mismo. Una búsqueda con cualquiera de ellas encuentra las demás.
const GRUPOS = [
  'borrar eliminar quitar suprimir anular cancelar deshacer',
  'equivocado equivocacion error errores mal fallo corregir correccion rectificar rectificativa modificar cambiar editar arreglar abono devolucion',
  'factura facturas facturar facturacion',
  'cobrar cobro cobros cobrada pagado pagada pago abonado ingreso transferencia',
  'deber deben debe deuda impagado impago moroso morosos pendiente vencida vencido',
  'correo email mail emails correos enviar mandar gmail outlook hotmail',
  'copia copias backup respaldo seguridad exportar salvaguarda',
  'perder perdido perdida recuperar restaurar estropeado roto averiado formatear',
  'movil telefono iphone android smartphone tablet tableta ipad',
  'iva impuesto impuestos 303 trimestre trimestral hacienda aeat declaracion liquidacion gestoria',
  'gasto gastos ticket tickets gasolina gasoil diesel combustible peaje parking dieta',
  'camion camiones vehiculo vehiculos furgoneta flota itv matricula transporte transportista',
  'actualizar actualizacion actualizaciones version nueva novedades',
  'windows pc ordenador portatil escritorio',
  'servidor nas docker red oficina linux minipc',
  'logo logotipo diseño diseno plantilla aspecto personalizar colores marca',
  'firma firmar firmado firmada certificado fnmt electronica digital',
  'contraseña contrasena clave password acceder entrar login sesion bloqueado olvidado',
  'numero numeracion serie series correlativo contador',
  'presupuesto presupuestos oferta cotizacion',
  'albaran albaranes entrega',
  'irpf retencion retenciones',
  'intracomunitaria intracomunitario ue europa europeo extranjero exportacion pais vies',
  'tema temas oscuro claro apariencia',
  'privacidad rgpd lopd proteccion datos nube',
  'gratis gratuito precio coste cuesta pagar suscripcion licencia cuota',
  'cliente clientes comprador',
  'proveedor proveedores compra compras recibida recibidas',
  'producto productos servicio servicios articulo articulos catalogo tarifa',
  'instalar instalacion instalador descargar descarga',
  'usuario usuarios empleado empleados trabajador permisos rol',
  'imprimir pdf descargar ver',
  'exento exenta exentas exencion no sujeta sin iva',
  'repetir duplicar copiar recurrente mensual periodica',
  'agrupar juntos varios mes mensual',
  'aviso avisos alerta alertas recordatorio notificacion campana',
  'adjuntar adjunto adjuntos archivo subir foto justificante',
  'ayuda soporte contacto contactar problema incidencia',
  'abrir arrancar iniciar ejecutar cerrar',
  'desinstalar reinstalar',
  'verifactu veri*factu antifraude homologado',
  'recargo equivalencia minorista',
  'suplido suplidos tasa tasas',
  'proforma anticipo adelantado',
  'internet conexion offline wifi',
  'codigo abierto open source libre mit github',
  'migrar importar traer pasar facturascripts',
  'remoto fuera casa vpn https teletrabajo',
  'crear nuevo nueva hacer hago alta añadir anadir emitir',
  'poner incluir meter insertar añadir',
];
const conceptos = new Map(); // raíz → índices de grupo
GRUPOS.forEach((g, i) => {
  for (const p of g.split(' ')) {
    const r = raiz(normalizar(p));
    if (!conceptos.has(r)) conceptos.set(r, new Set());
    conceptos.get(r).add(i);
  }
});
const raicesGrupo = GRUPOS.map((g) => [...new Set(g.split(' ').map((p) => raiz(normalizar(p))))]);

/** Crea el buscador para una lista de preguntas ({ id, q, a, ejemplos, claves, prioridad }). */
export function crearBuscador(preguntas) {
  // ---------- Índice ----------
  const PESOS = { q: 3, ejemplos: 2.4, claves: 2, a: 1 };
  const textoPlano = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
  const docs = preguntas.map((p) => {
    const campos = {
      q: raices(p.q), ejemplos: raices((p.ejemplos || []).join(' ')), claves: raices(p.claves || ''), a: raices(textoPlano(p.a)),
    };
    const tf = new Map(); // raíz → frecuencia ponderada
    let largo = 0;
    for (const [campo, lista] of Object.entries(campos)) {
      for (const r of lista) tf.set(r, (tf.get(r) || 0) + PESOS[campo]);
      largo += lista.length * PESOS[campo];
    }
    const enTitulo = new Set([...campos.q, ...campos.ejemplos]);
    return { p, tf, largo, enTitulo };
  });
  const largoMedio = docs.reduce((t, d) => t + d.largo, 0) / docs.length;
  const df = new Map();
  for (const d of docs) for (const r of d.tf.keys()) df.set(r, (df.get(r) || 0) + 1);
  const vocabulario = [...df.keys()];
  const idf = (r) => Math.log(1 + (docs.length - (df.get(r) || 0) + 0.5) / ((df.get(r) || 0) + 0.5));

  function distancia(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let antes = null;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let minFila = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        // Letras cambiadas de orden («factrua») cuentan como una sola falta
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], antes[j - 2] + 1);
        minFila = Math.min(minFila, cur[j]);
      }
      if (minFila > max) return max + 1;
      antes = prev;
      prev = cur;
    }
    return prev[b.length];
  }

  /** Términos de búsqueda con su peso: la palabra, sus correcciones, lo que empieza igual y sus sinónimos. */
  function expandir(texto, ultimaIncompleta) {
    const lista = palabras(texto);
    const grupos = []; // un grupo por palabra escrita: sirve para medir cuántas partes de la búsqueda se cubren
    lista.forEach((palabra, i) => {
      const r = raiz(palabra);
      const terminos = new Map();
      const poner = (t, w) => { if ((terminos.get(t) || 0) < w) terminos.set(t, w); };
      if (df.has(r)) poner(r, 1);
      // Faltas de ortografía
      if (!df.has(r) && r.length >= 4) {
        const max = r.length >= 7 ? 2 : 1;
        for (const v of vocabulario) if (distancia(r, v, max) <= max) poner(v, 0.75);
      }
      // Palabra a medio escribir (la última mientras se teclea) o raíz que es prefijo
      if ((ultimaIncompleta && i === lista.length - 1) || !df.has(r)) {
        if (palabra.length >= 3) for (const v of vocabulario) if (v.startsWith(r) && v !== r) poner(v, 0.6);
      }
      // Sinónimos y conceptos (de la palabra y de sus correcciones)
      for (const t of [...terminos.keys(), r]) {
        for (const g of conceptos.get(t) || []) for (const s of raicesGrupo[g]) if (df.has(s)) poner(s, Math.min(terminos.get(t) || 1, 1) * 0.65);
      }
      if (terminos.size) grupos.push(terminos);
      else grupos.push(new Map()); // palabra que no aparece en ningún sitio: cuenta como no cubierta
    });
    return grupos;
  }

  function buscar(texto, ultimaIncompleta = false) {
    const grupos = expandir(texto, ultimaIncompleta);
    if (!grupos.length) return [];
    const k1 = 1.2;
    const b = 0.6;
    const res = [];
    for (const d of docs) {
      let total = 0;
      let cubiertos = 0;
      const coincidencias = new Set();
      for (const terminos of grupos) {
        let mejor = 0;
        for (const [t, w] of terminos) {
          const f = d.tf.get(t);
          if (!f) continue;
          const bm25 = idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.largo / largoMedio));
          const extra = d.enTitulo.has(t) ? 1.25 : 1;
          const s = bm25 * w * extra;
          if (s > 0) coincidencias.add(t);
          if (s > mejor) mejor = s;
        }
        if (mejor > 0) cubiertos++;
        total += mejor;
      }
      if (!total) continue;
      const cobertura = cubiertos / grupos.length;
      res.push({ p: d.p, puntos: total * (0.45 + 0.55 * cobertura) * (d.p.prioridad || 1), coincidencias, cobertura });
    }
    return res.sort((x, y) => y.puntos - x.puntos);
  }

  return buscar;
}

/** Resalta dentro de un elemento las palabras cuya raíz está en «coincidencias» (resultado de buscar). */
export function resaltar(elemento, coincidencias) {
  if (!coincidencias || !coincidencias.size) return;
  const recorrer = document.createTreeWalker(elemento, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('a, code, mark, .chips, figcaption, [data-sin-resaltar]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodos = [];
  while (recorrer.nextNode()) nodos.push(recorrer.currentNode);
  for (const n of nodos) {
    const partes = n.textContent.split(/([\p{L}\d*]+)/u);
    if (!partes.some((w) => w && w.length > 2 && coincidencias.has(raiz(normalizar(w))))) continue;
    const frag = document.createDocumentFragment();
    for (const w of partes) {
      if (w && w.length > 2 && coincidencias.has(raiz(normalizar(w)))) {
        const m = document.createElement('mark'); m.textContent = w; frag.append(m);
      } else frag.append(w);
    }
    n.replaceWith(frag);
  }
}

/** Decide qué enseñar: una respuesta recomendada (si destaca de verdad) y las relacionadas. */
export function seleccionar(resultados, max = 6) {
  if (!resultados.length || resultados[0].puntos < 0.8) return { recomendada: null, relacionadas: [] };
  const [primero, ...resto] = resultados;
  const clara = !resto.length || primero.puntos >= resto[0].puntos * 1.15 || primero.cobertura === 1;
  const relacionadas = resto.filter((r) => r.puntos >= primero.puntos * 0.4).slice(0, clara ? max : max + 1);
  return clara ? { recomendada: primero, relacionadas } : { recomendada: null, relacionadas: [primero, ...relacionadas] };
}
