// Centro de ayuda de la web: pinta las preguntas y las busca con el buscador compartido con la aplicación
// (shared/ayuda/, que construir-web.mjs copia en ayuda/). Lo que escribes no sale del navegador.
import { AYUDA } from './ayuda/preguntas.js';
import { crearBuscador, resaltar, seleccionar } from './ayuda/buscador.js';

const { categorias, preguntas } = AYUDA;
const buscar = crearBuscador(preguntas);

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
const enlaceIncidencia = (q) => `https://github.com/im7manu/7factura/issues/new?title=${encodeURIComponent(q || 'Duda')}`;
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
  if (!seleccionar(res).relacionadas.length && !seleccionar(res).recomendada) {
    zonaRes.innerHTML = `<div class="sin-resultados">
      <h3>No hemos encontrado nada sobre «${seguro(q)}»</h3>
      <p>Prueba con otras palabras, por ejemplo «cobrar una factura» o «copia de seguridad», o mira las categorías.</p>
      <p>Si sigues con la duda, <a href="${enlaceIncidencia(q)}">pregúntalo en GitHub</a> o consulta el <a href="manual-facturador.pdf">manual en PDF</a>.</p>
      <p><button type="button" class="boton secundario" id="ver-todo">Ver todas las preguntas</button></p></div>`;
    estado.textContent = 'Sin resultados';
    $('#ver-todo').addEventListener('click', () => { caja.value = ''; mostrar('', false); caja.focus(); });
    return;
  }
  const { recomendada, relacionadas } = seleccionar(res);
  let html = '';
  if (recomendada) {
    html += `<article class="recomendada" aria-labelledby="rec-t">
      <div class="etiqueta">${icono('M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z')}Creemos que esto es lo que buscas</div>
      <div class="contenido"><h3 id="rec-t">${recomendada.p.q}</h3><div class="respuesta">${recomendada.p.a}${chips(recomendada.p)}</div>
      <div class="util">¿No era esto? Mira las preguntas relacionadas de abajo o <a href="${enlaceIncidencia(q)}">pregúntalo en GitHub</a>.</div></div>
    </article>`;
    if (relacionadas.length) html += `<div class="otras"><h3>También puede ayudarte</h3>${relacionadas.map((r) => pregunta(r.p, { prefijo: 'r-' })).join('')}</div>`;
  } else {
    html += `<div class="otras"><h3>Estas preguntas pueden resolver tu duda</h3>${relacionadas.map((r, i) => pregunta(r.p, { abierta: i === 0, prefijo: 'r-' })).join('')}</div>`;
  }
  zonaRes.innerHTML = html;
  const coinc = new Set(res.slice(0, 8).flatMap((r) => [...r.coincidencias]));
  resaltar(zonaRes, coinc);
  const n = (recomendada ? 1 : 0) + relacionadas.length;
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
