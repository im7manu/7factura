// Asistente «¿cuál me conviene?» de la portada. No guarda nada.
(() => {
  const f = document.getElementById('asistente');
  const v = document.getElementById('veredicto');
  if (!f || !v) return;
  f.addEventListener('submit', (e) => e.preventDefault());
  const WIN = 'https://github.com/im7manu/facturador/releases/latest/download/Facturador-Instalador-Windows.exe';
  const SRV = 'https://github.com/im7manu/facturador/blob/main/docs/instalacion.md';
  f.addEventListener('change', () => {
    const quien = f.querySelector('input[name=quien]:checked')?.value;
    const movil = f.querySelector('input[name=movil]:checked')?.value;
    if (!quien || !movil) return;
    let html;
    if (quien === 'solo' && movil === 'no') {
      html = `<strong>Te conviene la versión para Windows.</strong> Se instala en un minuto y no necesitas nada más. Si algún día creces, podrás pasar tus datos a la versión de servidor con una copia de seguridad. <br><a href="${WIN}">Descargar para Windows →</a>`;
    } else if (quien === 'solo') {
      html = `<strong>Te conviene la versión para servidor.</strong> La de Windows solo se puede usar desde el ordenador donde está instalada. Para usarlo desde el móvil necesitas un equipo siempre encendido (un miniPC o un NAS sirven) con la versión de servidor. <br><a href="${SRV}">Ver la guía de instalación →</a>`;
    } else {
      html = `<strong>Te conviene la versión para servidor.</strong> Se instala una vez y todo el equipo la usa desde su navegador, cada uno con su usuario${movil === 'si' ? ', también desde el móvil o fuera de la oficina' : ''}. <br><a href="${SRV}">Ver la guía de instalación →</a>`;
    }
    v.innerHTML = html;
    v.classList.add('visible');
  });
})();
