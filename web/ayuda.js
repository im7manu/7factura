// Centro de ayuda: pinta las preguntas y las busca «entendiendo» lo que se pregunta.
// Todo ocurre en el navegador: lo que escribes no se envía a ningún sitio ni se guarda.
//
// Cómo entiende la búsqueda:
//  1. Normaliza (minúsculas, sin tildes) y quita palabras vacías («el», «como», «puedo»…).
//  2. Reduce cada palabra a su raíz («facturas», «facturar», «facturado» → «factur»).
//  3. Amplía con sinónimos y conceptos («borrar» también busca «eliminar», «anular», «rectificar»…).
//  4. Tolera faltas de ortografía (distancia de edición) y palabras a medio escribir.
//  5. Puntúa cada pregunta (BM25) por su título, por frases de ejemplo de cómo la haría la gente, por palabras clave
//     y por el texto de la respuesta, y premia las que cubren más partes de la búsqueda.
(() => {
  const { categorias, preguntas } = window.AYUDA;

  // ---------- Texto ----------
  const VACIAS = new Set(('a al algo algun alguna algunas alguno algunos ante antes aqui asi aun bien cada como con cual cuales cuando cuanto de del desde donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estan estar estas este esto estos esta ha hace hacer hacerlo hay he hola la las le les lo los mas me mi mis mucho muy necesito ni no nos o os otra otro para pero poco por porque puede pueden puedo pues que quiero se sea ser si sin sobre solo son su sus tambien tan tener tengo ti tiene todo todos tu tus un una unas uno unos usted ya yo quiero saber gustaria favor facturador programa aplicacion app').split(' '));
  const normalizar = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ*]+/g, ' ').trim();
  const SUFIJOS = ['aciones', 'iciones', 'amiento', 'imiento', 'adoras', 'adores', 'ciones', 'acion', 'icion', 'mente', 'ancia', 'encia', 'adora', 'ador',
    'ando', 'iendo', 'an', 'en', 'ados', 'idos', 'adas', 'idas', 'ado', 'ido', 'ada', 'ida', 'ces', 'ar', 'er', 'ir', 'es', 'as', 'os', 'is', 's', 'a', 'o', 'e'];
  const raizCache = new Map();
  function raiz(p) {
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

  // ---------- Pintar ----------
  const $ = (s) => document.querySelector(s);
  const catPorId = Object.fromEntries(categorias.map((c) => [c.id, c]));
  const icono = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const chips = (p) => {
    const c = catPorId[p.cat];
    let h = `<span class="chip">${c.titulo}</span>`;
    if (p.v === 'win') h += '<span class="chip win">Solo Windows</span>';
    if (p.v === 'srv') h += '<span class="chip srv">Solo servidor</span>';
    return `<div class="chips">${h}</div>`;
  };
  const enlaceIncidencia = (q) => `https://github.com/im7manu/facturador/issues/new?title=${encodeURIComponent(q || 'Duda')}`;
  const pregunta = (p, { abierta = false, prefijo = '' } = {}) => `
    <details class="pregunta" id="${prefijo}${p.id}"${abierta ? ' open' : ''}>
      <summary>${p.q}</summary>
      <div class="respuesta">${p.a}${chips(p)}
        <div class="util"><a href="#${p.id}" data-enlace="${p.id}">Enlace a esta pregunta</a></div>
      </div>
    </details>`;

  // Índice y categorías
  $('#indice').innerHTML = categorias.map((c) => `<li><a href="#cat-${c.id}">${c.titulo}</a></li>`).join('');
  $('#categorias').innerHTML = categorias.map((c) => {
    const lista = preguntas.filter((p) => p.cat === c.id);
    return `<section class="categoria" id="cat-${c.id}" aria-labelledby="t-${c.id}">
      <h2 id="t-${c.id}"><span class="icono" data-color="${c.color}">${icono(c.icono)}</span>${c.titulo}</h2>
      <p>${c.desc}</p>
      ${lista.map((p) => pregunta(p)).join('')}
    </section>`;
  }).join('');
  document.querySelectorAll('.icono[data-color]').forEach((e) => { e.style.backgroundColor = e.dataset.color; });
  $('#total-preguntas').textContent = preguntas.length;

  // Resaltado de las palabras que han coincidido
  function resaltar(raiz0, coincidencias) {
    if (!coincidencias.size) return;
    const recorrer = document.createTreeWalker(raiz0, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('a, code, mark, .chips, figcaption') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodos = [];
    while (recorrer.nextNode()) nodos.push(recorrer.currentNode);
    for (const n of nodos) {
      const partes = n.textContent.split(/([\p{L}\d*]+)/u);
      if (!partes.some((w) => w && coincidencias.has(raiz(normalizar(w))))) continue;
      const frag = document.createDocumentFragment();
      for (const w of partes) {
        if (w && w.length > 2 && coincidencias.has(raiz(normalizar(w)))) {
          const m = document.createElement('mark'); m.textContent = w; frag.append(m);
        } else frag.append(w);
      }
      n.replaceWith(frag);
    }
  }

  const caja = $('#busqueda');
  const envoltorio = $('#buscador');
  const zonaRes = $('#resultados');
  const zonaCat = $('#categorias');
  const estado = $('#estado');

  function mostrar(texto, tecleando) {
    const q = texto.trim();
    envoltorio.classList.toggle('con-texto', q.length > 0);
    document.querySelector('.ayuda-cuerpo').classList.toggle('buscando', q.length >= 2);
    if (q.length < 2) {
      zonaRes.hidden = true; zonaCat.hidden = false; estado.textContent = '';
      return;
    }
    const res = buscar(q, tecleando);
    zonaCat.hidden = true;
    zonaRes.hidden = false;
    const seguro = (s) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    if (!res.length || res[0].puntos < 0.8) {
      zonaRes.innerHTML = `<div class="sin-resultados">
        <h3>No hemos encontrado nada sobre «${seguro(q)}»</h3>
        <p>Prueba con otras palabras, por ejemplo «cobrar una factura» o «copia de seguridad», o mira las categorías.</p>
        <p>Si sigues con la duda, <a href="${enlaceIncidencia(q)}">pregúntalo en GitHub</a> o consulta el <a href="manual-facturador.pdf">manual en PDF</a>.</p>
        <p><button type="button" class="boton secundario" id="ver-todo">Ver todas las preguntas</button></p></div>`;
      estado.textContent = 'Sin resultados';
      $('#ver-todo').addEventListener('click', () => { caja.value = ''; mostrar('', false); caja.focus(); });
      return;
    }
    const [primero, ...resto] = res;
    // Recomendación destacada solo si destaca de verdad sobre las demás
    const clara = !resto.length || primero.puntos >= resto[0].puntos * 1.15 || primero.cobertura === 1;
    const otras = resto.filter((r) => r.puntos >= primero.puntos * 0.4).slice(0, clara ? 6 : 7);
    let html = '';
    if (clara) {
      html += `<article class="recomendada" aria-labelledby="rec-t">
        <div class="etiqueta">${icono('M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z')}Creemos que esto es lo que buscas</div>
        <div class="contenido"><h3 id="rec-t">${primero.p.q}</h3><div class="respuesta">${primero.p.a}${chips(primero.p)}</div>
        <div class="util">¿No era esto? Mira las preguntas relacionadas de abajo o <a href="${enlaceIncidencia(q)}">pregúntalo en GitHub</a>.</div></div>
      </article>`;
      if (otras.length) html += `<div class="otras"><h3>También puede ayudarte</h3>${otras.map((r) => pregunta(r.p, { prefijo: 'r-' })).join('')}</div>`;
    } else {
      html += `<div class="otras"><h3>Estas preguntas pueden resolver tu duda</h3>${[primero, ...otras].map((r, i) => pregunta(r.p, { abierta: i === 0, prefijo: 'r-' })).join('')}</div>`;
    }
    zonaRes.innerHTML = html;
    const coinc = new Set(res.slice(0, 8).flatMap((r) => [...r.coincidencias]));
    resaltar(zonaRes, coinc);
    const n = (clara ? 1 : 0) + (clara ? otras.length : otras.length + 1);
    estado.textContent = `${n} ${n === 1 ? 'respuesta' : 'respuestas'} para «${q}»`;
  }

  let temporizador;
  caja.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      mostrar(caja.value, true);
      // La búsqueda va en el fragmento (#buscar=…), que el navegador nunca envía al servidor
      const t = caja.value.trim();
      history.replaceState(null, '', `${location.pathname}${t ? `#buscar=${encodeURIComponent(t)}` : ''}`);
    }, 140);
  });
  caja.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); mostrar(caja.value, false); zonaRes.querySelector('.recomendada, details')?.scrollIntoView({ block: 'start' }); }
    if (e.key === 'Escape') { caja.value = ''; caja.dispatchEvent(new Event('input')); }
  });
  $('#limpiar').addEventListener('click', () => { caja.value = ''; caja.dispatchEvent(new Event('input')); caja.focus(); });
  document.querySelectorAll('[data-ejemplo]').forEach((b) => b.addEventListener('click', () => {
    caja.value = b.dataset.ejemplo; caja.dispatchEvent(new Event('input')); caja.focus();
  }));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!id || id.startsWith('cat-') || id === 'contenido') {
      if (!zonaCat.hidden) return;
      // Desde los resultados, un enlace a una categoría vuelve a la lista completa
      caja.value = ''; mostrar('', false);
      return;
    }
    const p = preguntas.find((x) => x.id === id);
    if (!p) return;
    e.preventDefault();
    caja.value = ''; mostrar('', false);
    abrir(id);
    history.replaceState(null, '', `${location.pathname}#${id}`);
  });

  function abrir(id) {
    const d = document.getElementById(id);
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ block: 'start' });
    d.querySelector('summary')?.focus({ preventScroll: true });
  }

  // Estado inicial: #buscar=… o #pregunta
  const fragmento = decodeURIComponent(location.hash.slice(1));
  if (fragmento.startsWith('buscar=')) { caja.value = fragmento.slice(7); mostrar(caja.value, false); }
  else if (fragmento) abrir(fragmento);

  // Para las pruebas automáticas
  window.__buscarAyuda = buscar;
})();
