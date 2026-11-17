// Pruebas de extremo a extremo de la API (servidor real con base de datos temporal).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validarNif, validarIban } from '../lib/nif.mjs';
import { calcularTotales } from '../lib/totales.mjs';
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const PORT = 9199;
const BASE = `http://127.0.0.1:${PORT}`;
let srv;
let dir;
let cookie = '';

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, body: tipo.includes('json') ? await r.json() : await r.arrayBuffer() };
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facturador-test-'));
  srv = spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dir, PLUGINS_DIR: path.join(dir, 'plugins'), CORREO_PRUEBA_DIR: path.join(dir, 'correo') },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((ok) => srv.stdout.on('data', (d) => String(d).includes('escuchando') && ok()));
});

after(() => {
  srv.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('validadores', () => {
  assert.equal(validarNif('12345678Z').valido, true);
  assert.equal(validarNif('12345678A').valido, false);
  assert.equal(validarNif('X1234567L').valido, true);
  assert.equal(validarNif('B12345674').valido, true);
  assert.equal(validarIban('ES9121000418450200051332'), true);
  assert.equal(validarIban('ES9121000418450200051333'), false);
});

test('totales con varios tipos de IVA e IRPF', () => {
  const t = calcularTotales([
    { cantidad: 2, precio: 100, dto: 10, iva: 21, irpf: 15 },
    { cantidad: 1, precio: 50, dto: 0, iva: 10, irpf: 0 },
  ]);
  assert.equal(t.neto, 230);
  assert.equal(t.totalIva, 42.8);
  assert.equal(t.totalIrpf, 27);
  assert.equal(t.total, 245.8);
});

test('flujo completo: instalación, cliente, factura, emisión, rectificativa', async () => {
  let r = await api('GET', '/api/estado');
  assert.equal(r.body.instalado, false);

  r = await api('POST', '/api/setup', {
    usuario: { usuario: 'admin', nombre: 'Admin', password: 'Contrasena123!' },
    empresa: { razon_social: 'Transportes Prueba', nif: '12345678Z', iban: 'ES9121000418450200051332' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await api('POST', '/api/setup', { usuario: {}, empresa: {} });
  assert.equal(r.status, 400);

  r = await api('POST', '/api/clientes', { nombre: 'Cliente SL', nif: 'B12345674', forma_pago: 'TRANS' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const cliente = r.body;

  r = await api('POST', '/api/documentos', {
    tipo: 'factura', fecha: '2026-03-10', cliente_id: cliente.id, forma_pago: 'TRANS',
    lineas: [{ descripcion: 'Porte Madrid - Valencia', cantidad: 1, precio: 1000, iva: 21 }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const f1 = r.body;
  assert.equal(f1.estado, 'borrador');
  assert.equal(f1.total, 1210);

  r = await api('POST', `/api/documentos/${f1.id}/emitir`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.codigo, '1/2026');
  assert.equal(r.body.vencimiento, '2026-04-09');
  assert.match(r.body.huella, /^[A-F0-9]{64}$/);

  // Una emitida no se puede editar ni borrar
  assert.equal((await api('PUT', `/api/documentos/${f1.id}`, { observaciones: 'x' })).status, 409);
  assert.equal((await api('DELETE', `/api/documentos/${f1.id}`)).status, 409);

  // Fecha anterior a la última emitida: rechazada
  r = await api('POST', '/api/documentos', { tipo: 'factura', fecha: '2026-03-01', cliente_id: cliente.id, lineas: [{ descripcion: 'x', precio: 1 }] });
  const f2 = r.body;
  r = await api('POST', `/api/documentos/${f2.id}/emitir`);
  assert.equal(r.status, 409);
  await api('PUT', `/api/documentos/${f2.id}`, { fecha: '2026-03-15' });
  r = await api('POST', `/api/documentos/${f2.id}/emitir`);
  assert.equal(r.body.codigo, '2/2026');
  assert.equal(r.body.huella_anterior, (await api('GET', `/api/documentos/${f1.id}`)).body.huella);

  // Cobro
  r = await api('POST', `/api/documentos/${f1.id}/estado`, { estado: 'pagada' });
  assert.equal(r.body.estado, 'pagada');

  // Rectificativa
  r = await api('POST', `/api/documentos/${f1.id}/rectificar`, { motivo: 'Error en el precio' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.serie, 'R');
  assert.equal(r.body.total, -1210);
  const today = new Date().toLocaleDateString('sv-SE');
  r = await api('POST', `/api/documentos/${r.body.id}/emitir`);
  assert.equal(r.body.codigo, `R1/${today.slice(0, 4)}`);

  // PDF
  r = await api('GET', `/api/documentos/${f1.id}/pdf`);
  assert.equal(r.status, 200);
  assert.equal(Buffer.from(r.body).subarray(0, 4).toString(), '%PDF');

  // Presupuesto → factura
  r = await api('POST', '/api/documentos', { tipo: 'presupuesto', cliente_id: cliente.id, lineas: [{ descripcion: 'Mudanza', precio: 500 }] });
  const p = r.body;
  r = await api('POST', `/api/documentos/${p.id}/emitir`);
  assert.match(r.body.codigo, /^P1\/\d{4}$/);
  r = await api('POST', `/api/documentos/${p.id}/facturar`);
  assert.equal(r.status, 201);
  assert.equal(r.body.origen_id, p.id);

  // Resumen e informe
  r = await api('GET', '/api/resumen');
  assert.equal(r.status, 200);
  r = await api('GET', '/api/informes/ejercicio/2026');
  assert.equal(r.body.trimestres[0].n, 2);

  // Proforma → factura
  r = await api('POST', '/api/documentos', { tipo: 'proforma', cliente_id: cliente.id, referencia: 'PED-778', lineas: [{ descripcion: 'Porte', precio: 100 }] });
  assert.equal(r.status, 201);
  const pf = r.body;
  r = await api('POST', `/api/documentos/${pf.id}/emitir`);
  assert.match(r.body.codigo, /^PF1\/\d{4}$/);
  r = await api('POST', `/api/documentos/${pf.id}/facturar`);
  assert.equal(r.body.referencia, 'PED-778');
  const fpf = r.body;
  await api('POST', `/api/documentos/${fpf.id}/emitir`);
  assert.equal((await api('GET', `/api/documentos/${pf.id}`)).body.estado, 'facturada');
  // Las proformas no cuentan en los informes de IVA
  r = await api('GET', `/api/documentos?tipo=proforma`);
  assert.equal(r.body.length, 1);

  // IVA completo: exenta, recargo de equivalencia, suplido e IRPF
  r = await api('POST', '/api/documentos', { tipo: 'factura', cliente_id: cliente.id, lineas: [
    { descripcion: 'Porte nacional', cantidad: 1, precio: 1000, iva: 21, recargo: 5.2, irpf: 1 },
    { descripcion: 'Transporte de exportación', cantidad: 1, precio: 500, iva: 21, operacion: 'E2' },
    { descripcion: 'Peaje pagado por cuenta del cliente', cantidad: 1, precio: 40, suplido: true },
  ] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const t = r.body.totales;
  assert.equal(t.neto, 1500);
  assert.equal(t.totalIva, 210);
  assert.equal(t.totalRecargo, 52);
  assert.equal(t.totalIrpf, 10);
  assert.equal(t.totalSuplidos, 40);
  assert.equal(t.total, 1792);
  assert.equal(r.body.lineas[1].iva, 0); // la exenta se guarda sin IVA
  assert.equal(t.leyendas.length, 1);
  assert.match(t.leyendas[0], /art\. 21/);
  r = await api('POST', '/api/documentos', { tipo: 'factura', cliente_id: cliente.id, lineas: [{ descripcion: 'x', operacion: 'Z9' }] });
  assert.equal(r.status, 400);

  // PDF sin valorar
  r = await api('GET', `/api/documentos/${f1.id}/pdf?sin_valorar=1`);
  assert.equal(r.status, 200);

  // Adjuntos
  const sub = await fetch(`${BASE}/api/adjuntos?entidad=documento&id=${f1.id}`, {
    method: 'POST', headers: { Cookie: cookie, Origin: BASE, 'Content-Type': 'application/pdf', 'X-Nombre-Archivo': encodeURIComponent('albarán firmado.pdf') },
    body: Buffer.from('%PDF-1.4 prueba'),
  });
  assert.equal(sub.status, 201);
  const adj = await sub.json();
  r = await api('GET', `/api/adjuntos?entidad=documento&id=${f1.id}`);
  assert.equal(r.body[0].nombre, 'albarán firmado.pdf');
  const des = await fetch(`${BASE}/api/adjuntos/${adj.id}/descargar`, { headers: { Cookie: cookie } });
  assert.equal(await des.text(), '%PDF-1.4 prueba');
  assert.match(des.headers.get('content-disposition'), /attachment/);
  const html = await fetch(`${BASE}/api/adjuntos?entidad=documento&id=${f1.id}`, {
    method: 'POST', headers: { Cookie: cookie, Origin: BASE, 'X-Nombre-Archivo': 'malo.html' }, body: '<script>alert(1)</script>',
  });
  assert.equal(html.status, 400);
  const tr = await fetch(`${BASE}/api/adjuntos?entidad=documento&id=${f1.id}`, {
    method: 'POST', headers: { Cookie: cookie, Origin: BASE, 'X-Nombre-Archivo': encodeURIComponent('../../etc/passwd.txt') }, body: 'x',
  });
  assert.equal(tr.status, 201);
  assert.equal((await tr.json()).nombre, 'passwd.txt'); // se queda solo con el nombre
  assert.equal((await api('DELETE', `/api/adjuntos/${adj.id}`)).status, 200);

  // Formato de serie configurable
  r = await api('PUT', '/api/series/A', { formato: 'F{num4}-{aa}' });
  assert.equal(r.status, 200);
  r = await api('POST', '/api/documentos', { tipo: 'factura', fecha: today, cliente_id: cliente.id, lineas: [{ descripcion: 'x', precio: 1 }] });
  r = await api('POST', `/api/documentos/${r.body.id}/emitir`);
  assert.match(r.body.codigo, /^F\d{4}-\d{2}$/);

  // ---- Cobros: plazos, días de pago, cobros parciales y avisos ----
  r = await api('POST', '/api/formas-pago', { codigo: 'G3060', descripcion: 'Giro 30-60', dias: 30, plazos: [{ dias: 30, pct: 50 }, { dias: 60, pct: 50 }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await api('POST', '/api/formas-pago', { codigo: 'MAL', plazos: [{ dias: 30, pct: 40 }, { dias: 60, pct: 40 }] })).status, 400);
  r = await api('POST', '/api/clientes', { nombre: 'Paga días 10 y 25', nif: 'A58818501', forma_pago: 'G3060', dias_pago: '10, 25' });
  const cp = r.body;
  assert.equal(cp.dias_pago, '10,25');
  r = await api('POST', '/api/documentos', { tipo: 'factura', fecha: today, cliente_id: cp.id, forma_pago: 'G3060', lineas: [{ descripcion: 'Porte', precio: 1000, iva: 21 }] });
  r = await api('POST', `/api/documentos/${r.body.id}/emitir`);
  const fc = r.body;
  assert.equal(fc.recibos.length, 2);
  assert.equal(fc.recibos[0].importe + fc.recibos[1].importe, 1210);
  for (const rc of fc.recibos) assert.ok(['10', '25'].includes(rc.vencimiento.slice(8)), rc.vencimiento);
  // Cobro parcial
  r = await api('POST', `/api/cobros/recibos/${fc.recibos[0].id}/cobros`, { importe: 100, fecha: today });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  let doc = (await api('GET', `/api/documentos/${fc.id}`)).body;
  assert.equal(doc.estado, 'emitida');
  assert.equal(doc.cobrado, 100);
  assert.equal((await api('POST', `/api/cobros/recibos/${fc.recibos[0].id}/cobros`, { importe: 9999 })).status, 400);
  // Editar vencimientos: deben sumar el total (el recibo con cobros se conserva)
  assert.equal((await api('PUT', `/api/cobros/documentos/${fc.id}/recibos`, { recibos: [{ importe: 1, vencimiento: today }] })).status, 400);
  r = await api('PUT', `/api/cobros/documentos/${fc.id}/recibos`, { recibos: [{ importe: 300, vencimiento: today }, { importe: 305, vencimiento: today }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.length, 3);
  // Marcar cobrada cobra todo lo pendiente
  r = await api('POST', `/api/documentos/${fc.id}/estado`, { estado: 'pagada' });
  assert.equal(r.body.estado, 'pagada');
  assert.equal(r.body.cobrado, 1210);
  // Anular un cobro la devuelve a pendiente
  const unCobro = r.body.recibos[0].cobros[0].id;
  r = await api('DELETE', `/api/cobros/cobros/${unCobro}`);
  assert.equal((await api('GET', `/api/documentos/${fc.id}`)).body.estado, 'emitida');
  // Opciones: sin cobros parciales
  r = await api('PUT', '/api/cobros/ajustes', { cobros_parciales: false, aviso_dias_antes: 400 });
  assert.equal(r.body.cobros_parciales, false);
  assert.equal(r.body.aviso_dias_antes, 365);
  const pend = (await api('GET', `/api/documentos/${fc.id}`)).body.recibos.find((x) => x.pendiente);
  assert.equal((await api('POST', `/api/cobros/recibos/${pend.id}/cobros`, { importe: 1 })).status, 400);
  // Listado y avisos
  r = await api('GET', '/api/cobros/recibos?estado=pendientes');
  assert.ok(r.body.some((x) => x.documento_id === fc.id));
  r = await api('GET', '/api/cobros/avisos');
  assert.equal(r.body.activos, true);
  assert.ok(r.body.proximos.length + r.body.impagados.length >= 1);

  // ---- Pedidos, albaranes, firma y facturación del mes ----
  r = await api('POST', '/api/documentos', { tipo: 'presupuesto', cliente_id: cliente.id, lineas: [{ descripcion: 'Portes semana', cantidad: 3, precio: 200, iva: 21 }] });
  const pre = r.body;
  await api('POST', `/api/documentos/${pre.id}/emitir`);
  r = await api('POST', `/api/documentos/${pre.id}/convertir`, { destino: 'pedido' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const ped = r.body;
  r = await api('POST', `/api/documentos/${ped.id}/emitir`);
  assert.match(r.body.codigo, /^PED1\/\d{4}$/);
  assert.equal((await api('GET', `/api/documentos/${pre.id}`)).body.estado, 'aceptado');
  r = await api('POST', `/api/documentos/${ped.id}/convertir`, { destino: 'albaran', valorado: false });
  const alb1 = r.body;
  assert.equal(alb1.tipo, 'albaran');
  r = await api('PUT', `/api/documentos/${alb1.id}`, { valorado: false, fecha: today });
  assert.equal(r.body.valorado, false);
  r = await api('POST', `/api/documentos/${alb1.id}/emitir`);
  assert.match(r.body.codigo, /^ALB1\/\d{4}$/);
  assert.equal((await api('GET', `/api/documentos/${ped.id}`)).body.estado, 'servido');
  // PDF del albarán no valorado (por defecto sin precios) y con recuadro de firma
  assert.equal((await api('GET', `/api/documentos/${alb1.id}/pdf`)).status, 200);
  // Firma en pantalla (PNG mínimo válido)
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  r = await api('POST', `/api/documentos/${alb1.id}/firma`, { nombre: 'Juan Receptor', dni: '12345678z', imagen: png });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.estado, 'firmado');
  assert.equal(r.body.firma_dni, '12345678Z');
  assert.equal((await api('POST', `/api/documentos/${alb1.id}/firma`, { nombre: 'X', imagen: 'data:image/png;base64,AAAA' })).status, 400);
  assert.equal((await api('GET', `/api/documentos/${alb1.id}/pdf`)).status, 200);
  // Segundo albarán directo y facturación del periodo (una factura por cliente)
  r = await api('POST', '/api/documentos', { tipo: 'albaran', fecha: today, cliente_id: cliente.id, lineas: [{ descripcion: 'Porte extra', precio: 150, iva: 21 }] });
  const alb2 = r.body;
  assert.equal(alb2.valorado, true);
  await api('POST', `/api/documentos/${alb2.id}/emitir`);
  const ini = `${today.slice(0, 7)}-01`;
  r = await api('GET', `/api/documentos/facturar-periodo?desde=${ini}&hasta=${today}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.length, 1);
  assert.equal(r.body[0].albaranes.length, 2);
  r = await api('POST', '/api/documentos/facturar-periodo', { desde: ini, hasta: today, fecha: today, emitir: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.length, 1);
  assert.equal(r.body[0].error, null);
  assert.equal(r.body[0].estado, 'emitida');
  assert.equal(r.body[0].total, r2(726 + 181.5));
  const fm = (await api('GET', `/api/documentos/${r.body[0].id}`)).body;
  assert.equal(fm.origenes.length, 2);
  assert.match(fm.lineas[0].descripcion, /^ALB1\//);
  assert.equal((await api('GET', `/api/documentos/${alb1.id}`)).body.estado, 'facturado');
  assert.equal((await api('GET', `/api/documentos/${ped.id}`)).body.estado, 'servido');
  // No se puede volver a facturar
  assert.equal((await api('POST', '/api/documentos/agrupar', { ids: [alb1.id, alb2.id] })).status, 409);
  assert.equal((await api('GET', `/api/documentos/facturar-periodo?desde=${ini}&hasta=${today}`)).body.length, 0);
  // Opciones de ventas
  r = await api('PUT', '/api/documentos/ajustes-ventas', { albaran_valorado: false });
  assert.equal(r.body.albaran_valorado, false);
  r = await api('POST', '/api/documentos', { tipo: 'albaran', cliente_id: cliente.id, lineas: [{ descripcion: 'x', precio: 1 }] });
  assert.equal(r.body.valorado, false);

  // ---- Compras: proveedores, facturas recibidas, gastos, vehículos y datos compartidos ----
  r = await api('POST', '/api/proveedores', { nombre: 'Gasóleos del Norte SL', nif: 'A58818501', forma_pago: 'TRANS' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const prov = r.body;
  assert.match(prov.uid, /^[0-9a-f-]{36}$/);
  assert.equal((await api('POST', '/api/proveedores', { nombre: 'Malo', nif: '123' })).status, 400);
  r = await api('POST', '/api/vehiculos', { matricula: '1234 abc', tipo: 'Tractora', modelo: 'Volvo FH', itv: '2027-03-01' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const veh = r.body;
  assert.equal(veh.matricula, '1234ABC');
  assert.equal((await api('POST', '/api/vehiculos', { matricula: '1234ABC' })).status, 409);
  assert.equal((await api('POST', '/api/conductores', { nombre: 'Ana', dni: '12345678Z' })).status, 201);
  assert.equal((await api('POST', '/api/conductores', { nombre: 'Mal', dni: '00000000A' })).status, 400);
  // Factura recibida: necesita el nº del proveedor; IVA soportado y asignada a vehículo
  r = await api('POST', '/api/documentos', { tipo: 'factura_compra', fecha: '2026-02-10', proveedor_id: prov.id, forma_pago: 'TRANS',
    lineas: [{ descripcion: 'Gasóleo', cantidad: 500, precio: 1.2, iva: 21, vehiculo_id: veh.id }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const fcomp = r.body;
  assert.equal(fcomp.cliente.nombre, 'Gasóleos del Norte SL');
  assert.equal((await api('POST', `/api/documentos/${fcomp.id}/emitir`)).status, 400);
  await api('PUT', `/api/documentos/${fcomp.id}`, { numero_proveedor: 'GN-2026-0042' });
  r = await api('POST', `/api/documentos/${fcomp.id}/emitir`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.codigo, /^FC1\/2026$/);
  assert.equal(r.body.huella, null); // las compras no entran en la cadena de huellas
  assert.equal(r.body.recibos.length, 1);
  // La misma factura del proveedor no se puede registrar dos veces
  r = await api('POST', '/api/documentos', { tipo: 'factura_compra', fecha: '2026-01-05', proveedor_id: prov.id, numero_proveedor: 'GN-2026-0042', lineas: [{ descripcion: 'x', precio: 1 }] });
  assert.equal((await api('POST', `/api/documentos/${r.body.id}/emitir`)).status, 409);
  // …pero una con fecha anterior y otro número sí (las compras pueden llegar desordenadas)
  await api('PUT', `/api/documentos/${r.body.id}`, { numero_proveedor: 'GN-2026-0001' });
  assert.equal((await api('POST', `/api/documentos/${r.body.id}/emitir`)).status, 200);
  // Gasto (ticket) sin proveedor: se da por pagado al registrarlo
  r = await api('POST', '/api/documentos', { tipo: 'gasto', fecha: '2026-02-15', lineas: [{ descripcion: 'Peaje AP-1', precio: 10, iva: 21, vehiculo_id: veh.id }] });
  r = await api('POST', `/api/documentos/${r.body.id}/emitir`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.estado, 'pagada');
  // Pagos a proveedores
  r = await api('GET', '/api/cobros/recibos?ambito=compras&estado=pendientes');
  assert.ok(r.body.some((x) => x.documento_id === fcomp.id));
  assert.ok(!r.body.some((x) => x.tipo === 'factura'));
  // Informe: IVA soportado y resultado del trimestre, gasto por vehículo
  r = await api('GET', '/api/informes/ejercicio/2026');
  const t1 = r.body.trimestres[0];
  assert.equal(t1.soportado.iva, r2(126 + 2.1 + 0.21));
  assert.equal(t1.resultado, r2(t1.iva + t1.recargo - t1.soportado.iva));
  assert.equal(r.body.vehiculos[0].matricula, '1234ABC');
  assert.equal(r.body.vehiculos[0].base, 610);
  // Circuito de compra: pedido → albarán → factura
  r = await api('POST', '/api/documentos', { tipo: 'pedido_compra', proveedor_id: prov.id, lineas: [{ descripcion: 'Neumáticos', cantidad: 4, precio: 300, iva: 21 }] });
  const pc = r.body;
  await api('POST', `/api/documentos/${pc.id}/emitir`);
  r = await api('POST', `/api/documentos/${pc.id}/convertir`, { destino: 'albaran_compra' });
  const ac = r.body;
  await api('POST', `/api/documentos/${ac.id}/emitir`);
  assert.equal((await api('GET', `/api/documentos/${pc.id}`)).body.estado, 'recibido');
  r = await api('POST', '/api/documentos/agrupar', { ids: [ac.id] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.tipo, 'factura_compra');
  assert.equal(r.body.proveedor_id, prov.id);
  // Datos compartidos (base para conectar con Gestor DeCA)
  r = await api('GET', '/api/compartido/vehiculos');
  assert.equal(r.body.clave, 'matricula');
  assert.equal(r.body.registros[0].uid, veh.uid);
  r = await api('GET', '/api/compartido/clientes?desde=2999-01-01');
  assert.equal(r.body.registros.length, 0);
  // Opciones de compras
  r = await api('PUT', '/api/documentos/ajustes-compras', { gasto_pagado: false });
  assert.equal(r.body.gasto_pagado, false);

  // ---- Correo: cuenta, plantillas, envío con adjuntos y registro ----
  r = await api('POST', `/api/correo/documentos/${f1.id}/enviar`, { para: 'x@y.es', asunto: 'a' });
  assert.equal(r.status, 409); // sin cuenta conectada
  r = await api('POST', '/api/correo/smtp', { host: 'smtp.ejemplo.es', puerto: 587, usuario: 'yo', password: 'secreta', email: 'facturas@ejemplo.es', nombre: 'Transportes Prueba' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await api('GET', '/api/correo/estado');
  assert.equal(r.body.cuenta.email, 'facturas@ejemplo.es');
  assert.equal(r.body.cuenta.datos, undefined); // los secretos nunca salen del servidor
  await api('PUT', '/api/correo/cuenta', { nombre: 'Transportes Prueba', firma: '-- \nDpto. de administración' });
  await api('PUT', `/api/clientes/${cliente.id}`, { nombre: 'Cliente SL', nif: 'B12345674', forma_pago: 'TRANS', email: 'cliente@ejemplo.es' });
  r = await api('PUT', '/api/correo/plantillas', { plantillas: { factura: { asunto: 'Su factura {numero}', cuerpo: 'Hola {cliente}, total {total}.' } } });
  assert.equal(r.body.plantillas.factura.asunto, 'Su factura {numero}');
  r = await api('GET', `/api/correo/documentos/${f1.id}/borrador`);
  assert.equal(r.body.para, 'cliente@ejemplo.es');
  assert.equal(r.body.asunto, `Su factura ${(await api('GET', `/api/documentos/${f1.id}`)).body.codigo}`);
  assert.match(r.body.cuerpo, /Hola Cliente SL, total 1210,00/);
  assert.match(r.body.cuerpo, /Dpto\. de administración/);
  const adjs = r.body.adjuntos;
  assert.equal(adjs[0].id, 'pdf');
  const adjDoc = adjs.find((a) => a.id.startsWith('adj:'));
  assert.ok(adjDoc, 'el documento tiene un adjunto subido antes');
  assert.equal((await api('POST', `/api/correo/documentos/${f1.id}/enviar`, { para: 'no-es-un-correo', asunto: 'x', cuerpo: 'y' })).status, 400);
  r = await api('POST', `/api/correo/documentos/${f1.id}/enviar`, {
    para: 'cliente@ejemplo.es', cc: 'gestoria@ejemplo.es', asunto: 'Su factura\r\nBcc: espia@malo.es', cuerpo: 'Texto editado a mano', adjuntos: ['pdf', adjDoc.id],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const emls = fs.readdirSync(path.join(dir, 'correo'));
  assert.equal(emls.length, 1);
  const eml = fs.readFileSync(path.join(dir, 'correo', emls[0]), 'utf8');
  assert.match(eml, /^From: "?Transportes Prueba"? <facturas@ejemplo\.es>/m);
  assert.match(eml, /^To: cliente@ejemplo\.es/m);
  assert.match(eml, /^Cc: gestoria@ejemplo\.es/m);
  assert.doesNotMatch(eml, /^Bcc: espia/m); // sin inyección de cabeceras
  assert.match(eml, /Content-Type: application\/pdf/);
  assert.match(eml, /Texto editado a mano/);
  r = await api('GET', `/api/correo/documentos/${f1.id}/enviados`);
  assert.equal(r.body.length, 1);
  assert.equal(r.body[0].estado, 'enviado');
  assert.equal(r.body[0].adjuntos.length, 2);
  assert.equal(r.body[0].cc, 'gestoria@ejemplo.es');
  // Un borrador no se envía
  r = await api('POST', '/api/documentos', { tipo: 'factura', cliente_id: cliente.id, lineas: [{ descripcion: 'x', precio: 1 }] });
  assert.equal((await api('POST', `/api/correo/documentos/${r.body.id}/enviar`, { para: 'a@b.es', asunto: 'x' })).status, 409);
  // Aplicaciones OAuth: el secreto se guarda cifrado y nunca se devuelve; el inicio usa PKCE
  r = await api('PUT', '/api/correo/apps', { google: { client_id: '1234567890-abc.apps.googleusercontent.com', client_secret: 'GOCSPX-secreto' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.google.configurado, true);
  assert.equal(JSON.stringify(r.body).includes('GOCSPX'), false);
  r = await api('GET', '/api/correo/oauth/google/iniciar');
  const url = new URL(r.body.url);
  assert.equal(url.hostname, 'accounts.google.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(url.searchParams.get('scope'), /gmail\.send/);
  assert.match(url.searchParams.get('redirect_uri'), /\/api\/correo\/oauth\/vuelta$/);
  const vuelta = await fetch(`${BASE}/api/correo/oauth/vuelta?state=falso&code=x`);
  assert.match(await vuelta.text(), /correo=error/);
  assert.equal((await api('GET', '/api/correo/oauth/microsoft/iniciar')).status, 409); // sin app de Microsoft

  // Sin sesión
  cookie = '';
  assert.equal((await api('GET', '/api/clientes')).status, 401);
});

test('CSRF: rechaza origen ajeno', async () => {
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://malo.example' }, body: '{}',
  });
  assert.equal(r.status, 403);
});

test('seguridad: política de contraseñas, bloqueo y cabeceras', async () => {
  const { errorPassword, hashPassword, verifyPassword } = await import('../auth.mjs');
  assert.match(errorPassword('Contrasena123'), /símbolo/);
  assert.equal(errorPassword('Contrasena123!'), null);
  const h = hashPassword('Contrasena123!');
  assert.equal(h.split('$')[1].length, 64); // sal de 32 bytes
  assert.equal(verifyPassword('Contrasena123!', h), true);
  assert.equal(verifyPassword('otra', h), false);

  const r = await fetch(`${BASE}/api/estado`);
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.match(r.headers.get('permissions-policy'), /camera=\(\)/);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);

  // Referer de otro sitio sin Origin: bloqueado
  const csrf = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Referer: 'https://malo.example/x' }, body: '{}' });
  assert.equal(csrf.status, 403);

  // 5 fallos bloquean la cuenta, aunque luego la contraseña sea correcta
  const intento = (pw) => fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ usuario: 'admin', password: pw }) });
  for (let i = 0; i < 5; i++) await intento('mala');
  const bloqueada = await intento('Contrasena123!');
  assert.equal(bloqueada.status, 401);
  assert.match((await bloqueada.json()).error, /bloqueada/);
});
