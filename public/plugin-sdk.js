// SDK para las páginas de los plugins de 7Factura (se cargan dentro de la app en un iframe).
// Uso: <link rel="stylesheet" href="/plugin-sdk.css"><script src="/plugin-sdk.js"></script>
// - Copia el tema activo de la app (colores, fuente, forma, modo oscuro) para que el plugin se vea igual.
// - Facturador.api(ruta, {method, body}) llama a la API con la sesión del usuario y devuelve JSON (lanza Error con el mensaje).
// - Facturador.aviso(texto, tipo) muestra un aviso breve.
(function () {
  function copiarTema() {
    try {
      var padre = window.parent && window.parent !== window ? window.parent.document.documentElement : null;
      if (!padre) return;
      var estilo = window.parent.getComputedStyle(padre);
      var vars = ['canvas', 'surface', 'subtle', 'stroke', 'fg', 'muted', 'brand', 'brand-hover', 'brand-fg', 'brand-soft', 'brand-on', 'danger', 'success', 'warning',
        'fuente', 'radio', 'sombra-card', 'sombra-flyout'];
      var raiz = document.documentElement;
      vars.forEach(function (v) { var x = estilo.getPropertyValue('--' + v); if (x) raiz.style.setProperty('--' + v, x); });
      raiz.className = padre.className;
      ['cristal', 'relieve', 'densidad'].forEach(function (k) { if (padre.dataset[k]) raiz.dataset[k] = padre.dataset[k]; else delete raiz.dataset[k]; });
    } catch (e) { /* fuera de la app: se usan los valores por defecto del CSS */ }
  }
  copiarTema();
  try { new MutationObserver(copiarTema).observe(window.parent.document.documentElement, { attributes: true }); } catch (e) { /* sin acceso al padre */ }

  async function api(ruta, opciones) {
    opciones = opciones || {};
    var cuerpo = opciones.body;
    var cabeceras = Object.assign({}, opciones.headers || {});
    if (cuerpo !== undefined && !(cuerpo instanceof Blob) && !(cuerpo instanceof ArrayBuffer) && typeof cuerpo !== 'string') {
      cuerpo = JSON.stringify(cuerpo);
      cabeceras['Content-Type'] = 'application/json';
    }
    var r = await fetch(ruta, { method: opciones.method || (cuerpo !== undefined ? 'POST' : 'GET'), headers: cabeceras, body: cuerpo, credentials: 'same-origin' });
    var tipo = r.headers.get('content-type') || '';
    var datos = tipo.indexOf('json') >= 0 ? await r.json() : r;
    if (!r.ok) throw new Error((datos && datos.error) || ('Error ' + r.status));
    return datos;
  }

  function aviso(texto, tipo) {
    var d = document.createElement('div');
    d.className = 'fx-aviso fx-aviso-' + (tipo || 'ok');
    d.setAttribute('role', 'status');
    d.textContent = texto;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 4000);
  }

  function escapar(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  // Dentro de la ventana de una acción de documento: cerrarla o pedir que se recargue el documento
  function avisarPadre(tipo) { try { window.parent.postMessage({ tipo: tipo }, window.location.origin); } catch (e) { /* fuera de la app */ } }
  function parametro(nombre) { return new URLSearchParams(window.location.search).get(nombre); }

  window.Facturador = {
    api: api, aviso: aviso, escapar: escapar, parametro: parametro,
    cerrar: function () { avisarPadre('facturador:cerrar'); },
    actualizar: function () { avisarPadre('facturador:actualizar'); },
  };
})();
