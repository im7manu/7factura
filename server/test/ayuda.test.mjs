// Calidad del buscador de la ayuda (shared/ayuda): para cada duda escrita como la escribiría alguien,
// la pregunta correcta debe salir la primera. Si añades preguntas, añade aquí casos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AYUDA } from '../../shared/ayuda/preguntas.mjs';
import { crearBuscador, seleccionar } from '../../shared/ayuda/buscador.mjs';

const CASOS = [
  ['me he equivocado en una factura', 'corregir-factura'], ['como borro una factura', 'corregir-factura'],
  ['el cliente ya me ha pagado', 'apuntar-cobro'], ['quiero poner mi logo', 'logo-pdf'],
  ['se me ha roto el ordenador', 'restaurar'], ['cuanto iva pago este trimestre', 'modelo-303'],
  ['como hago una factrua', 'crear-factura'], ['nueva factura', 'crear-factura'],
  ['quien no me ha pagado', 'quien-me-debe'], ['mandar factura por mail', 'enviar-correo'],
  ['gasoil', 'gastos-tickets'], ['como meto un gasto', 'gastos-tickets'], ['no puedo entrar', 'olvide-contrasena'],
  ['olvide la clave', 'olvide-contrasena'], ['es gratis', 'precio'], ['cliente de francia', 'intracomunitaria'],
  ['exportacion fuera de europa', 'intracomunitaria'], ['firma del cliente en la tablet', 'albaran'],
  ['certificado digital', 'firma-digital'], ['retencion 15', 'irpf'], ['usar en el iphone', 'movil'],
  ['mis datos estan en la nube', 'privacidad'], ['windows dice que es peligroso', 'windows-protegio'],
  ['cambiar de ordenador', 'restaurar'], ['backup', 'hacer-copia'], ['copia de seguridad', 'hacer-copia'],
  ['ocultar albaranes', 'pedidos'], ['factura todos los meses igual', 'duplicar'], ['camion itv', 'vehiculos'],
  ['quitar el programa', 'windows-desinstalar'], ['que version descargo', 'que-version'], ['tengo 3 empleados', 'usuarios'],
  ['hacienda verifactu', 'verifactu'], ['modo oscuro', 'temas'], ['gmail', 'conectar-correo'],
  ['no me llegan los correos', 'conectar-correo'], ['pago a 60 dias', 'vencimientos'], ['iva exento formacion', 'tipos-iva'],
  ['plugin', 'plugins'], ['cobr', 'apuntar-cobro'], ['donde guarda las facturas', 'donde-datos'],
  ['se fue la luz actualizando', 'actualizacion-segura'], ['presupuesto aceptado', 'presupuesto'],
  ['albaranes del mes', 'facturar-mes'], ['mi gestoria necesita el 347', 'modelo-347'],
  ['envio el pdf al cliente', 'enviar-correo'], ['se puede usar sin internet', 'internet'],
  ['como pongo el iva al 10', 'tipos-iva'], ['meter un proveedor nuevo', 'nuevo-cliente'],
];

test('ayuda: datos coherentes', () => {
  const ids = new Set();
  for (const p of AYUDA.preguntas) {
    assert.ok(!ids.has(p.id), `id repetido: ${p.id}`);
    ids.add(p.id);
    assert.ok(AYUDA.categorias.some((c) => c.id === p.cat), `categoría desconocida en ${p.id}`);
    assert.ok(p.q && p.a, `pregunta incompleta: ${p.id}`);
  }
  for (const p of AYUDA.preguntas) {
    for (const m of p.a.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(m[1]), `enlace roto #${m[1]} en ${p.id}`);
  }
});

test('ayuda: el buscador entiende lo que se pregunta', () => {
  const buscar = crearBuscador(AYUDA.preguntas);
  const fallos = CASOS.filter(([q, id]) => buscar(q)[0]?.p.id !== id).map(([q, id]) => `«${q}» → ${buscar(q).slice(0, 3).map((r) => r.p.id).join(', ')} (esperado ${id})`);
  assert.deepEqual(fallos, []);
  assert.deepEqual(seleccionar(buscar('xyzzy plof')), { recomendada: null, relacionadas: [] });
});
