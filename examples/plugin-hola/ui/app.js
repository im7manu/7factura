fetch('/api/p/hola/saludo', { credentials: 'same-origin' })
  .then((r) => r.json())
  .then((d) => { document.getElementById('saludo').textContent = d.mensaje || d.error; });
