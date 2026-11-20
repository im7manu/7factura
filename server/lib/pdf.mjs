// Generación del PDF de facturas y presupuestos con pdfkit. Diseño propio.
import PDFDocument from 'pdfkit';
import { baseLinea, OPERACIONES } from './totales.mjs';

const AZUL = '#0F6CBD';
const GRIS = '#616161';
const LINEA = '#E0E0E0';
const FONDO = '#F5F5F5';

const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const num = (n, d = 2) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(Number(n) || 0);
const fecha = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

function titulo(doc) {
  if (doc.tipo === 'presupuesto') return 'PRESUPUESTO';
  if (doc.tipo === 'proforma') return 'FACTURA PROFORMA';
  if (doc.tipo === 'pedido') return 'PEDIDO';
  if (doc.tipo === 'albaran') return 'ALBARÁN';
  if (doc.rectifica_id) return 'FACTURA RECTIFICATIVA';
  if (doc.serie_tipo === 'simplificada') return 'FACTURA SIMPLIFICADA';
  return 'FACTURA';
}

/**
 * @param {object} p
 * @param {object} p.doc        documento con cliente (objeto), lineas, totales
 * @param {object} p.empresa    datos del emisor
 * @param {object|null} p.formaPago
 * @param {object|null} p.rectificada documento original si es rectificativa
 * @param {boolean} [p.sinValorar] oculta precios, importes y totales
 * @returns {PDFDocument}
 */
export function generarPdf({ doc, empresa, formaPago, rectificada, sinValorar = false, vencimientos = null, firma = null, alFinal = null }) {
  const pdf = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: {
    Title: `${titulo(doc)} ${doc.codigo || 'BORRADOR'}`, Author: empresa.razon_social || '', Creator: 'Facturador',
  } });
  const W = pdf.page.width;
  const M = 48;
  const ancho = W - M * 2;

  // Banda superior
  pdf.rect(0, 0, W, 6).fill(AZUL);

  // Emisor
  let y = 40;
  pdf.fillColor('#000').font('Helvetica-Bold').fontSize(14).text(empresa.razon_social || 'Mi empresa', M, y, { width: ancho * 0.55 });
  pdf.font('Helvetica').fontSize(9).fillColor(GRIS);
  const emisor = [
    empresa.nif && `NIF: ${empresa.nif}`,
    empresa.direccion,
    [empresa.cp, empresa.ciudad, empresa.provincia && `(${empresa.provincia})`].filter(Boolean).join(' '),
    [empresa.telefono, empresa.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
  pdf.text(emisor.join('\n'), M, pdf.y + 4, { width: ancho * 0.55 });
  const finEmisor = pdf.y;

  // Título y datos del documento
  pdf.font('Helvetica-Bold').fontSize(20).fillColor(AZUL).text(titulo(doc), M + ancho * 0.5, 38, { width: ancho * 0.5, align: 'right' });
  pdf.font('Helvetica').fontSize(9).fillColor('#000');
  const meta = [
    ['Número', doc.codigo || 'BORRADOR'],
    ['Fecha', fecha(doc.fecha)],
    doc.vencimiento && doc.tipo === 'factura' && !sinValorar ? ['Vencimiento', fecha(doc.vencimiento)] : null,
    ['presupuesto', 'proforma'].includes(doc.tipo) && doc.vencimiento ? ['Válido hasta', fecha(doc.vencimiento)] : null,
    doc.tipo === 'pedido' && doc.vencimiento ? ['Entrega prevista', fecha(doc.vencimiento)] : null,
    doc.referencia ? ['Su referencia', doc.referencia] : null,
  ].filter(Boolean);
  let my = 66;
  for (const [k, v] of meta) {
    pdf.fillColor(GRIS).text(k, M + ancho * 0.5, my, { width: ancho * 0.3, align: 'right' });
    pdf.fillColor('#000').font('Helvetica-Bold').text(v, M + ancho * 0.8, my, { width: ancho * 0.2, align: 'right' });
    pdf.font('Helvetica');
    my += 13;
  }

  // Cliente
  y = Math.max(finEmisor, my) + 18;
  const c = doc.cliente || {};
  const lineasCliente = [
    c.nif && `NIF: ${c.nif}`,
    c.direccion,
    [c.cp, c.ciudad, c.provincia && `(${c.provincia})`].filter(Boolean).join(' '),
    c.pais && c.pais !== 'ES' ? c.pais : null,
  ].filter(Boolean);
  const altoCliente = 30 + lineasCliente.length * 11;
  pdf.rect(M, y, ancho, altoCliente).fill(FONDO);
  pdf.rect(M, y, 3, altoCliente).fill(AZUL);
  pdf.fillColor(GRIS).fontSize(8).text('CLIENTE', M + 14, y + 8);
  pdf.fillColor('#000').font('Helvetica-Bold').fontSize(11).text(c.nombre || '—', M + 14, y + 18, { width: ancho - 28 });
  pdf.font('Helvetica').fontSize(9).fillColor('#000').text(lineasCliente.join('\n'), M + 14, pdf.y + 1, { width: ancho - 28 });
  y += altoCliente + 10;

  if (rectificada) {
    pdf.fontSize(9).fillColor('#000').font('Helvetica-Bold')
      .text(`Rectifica a la factura ${rectificada.codigo} de fecha ${fecha(rectificada.fecha)}`, M, y);
    pdf.font('Helvetica');
    if (doc.motivo) pdf.text(`Motivo: ${doc.motivo}`, M, pdf.y + 2, { width: ancho });
    y = pdf.y + 10;
  }

  // Tabla de líneas
  const hayDto = doc.lineas.some((l) => Number(l.dto));
  const hayIrpf = doc.lineas.some((l) => Number(l.irpf));
  const hayRecargo = doc.lineas.some((l) => Number(l.recargo));
  const cols = (sinValorar ? [
    { k: 'descripcion', t: 'Descripción', w: 0, a: 'left' },
    { k: 'cantidad', t: 'Cantidad', w: 70, a: 'right' },
  ] : [
    { k: 'descripcion', t: 'Descripción', w: 0, a: 'left' },
    { k: 'cantidad', t: 'Cant.', w: 46, a: 'right' },
    { k: 'precio', t: 'Precio', w: 66, a: 'right' },
    hayDto && { k: 'dto', t: 'Dto.', w: 38, a: 'right' },
    { k: 'iva', t: 'IVA', w: doc.lineas.some((l) => l.suplido || (l.operacion && l.operacion !== 'S1')) ? 74 : 44, a: 'right' },
    hayRecargo && { k: 'recargo', t: 'R.E.', w: 36, a: 'right' },
    hayIrpf && { k: 'irpf', t: 'IRPF', w: 36, a: 'right' },
    { k: 'importe', t: 'Importe', w: 76, a: 'right' },
  ]).filter(Boolean);
  cols[0].w = ancho - cols.slice(1).reduce((s, x) => s + x.w, 0);

  const cabecera = () => {
    pdf.rect(M, y, ancho, 20).fill(AZUL);
    let x = M;
    pdf.font('Helvetica-Bold').fontSize(8.5).fillColor('#fff');
    for (const col of cols) {
      pdf.text(col.t, x + 6, y + 6, { width: col.w - 12, align: col.a });
      x += col.w;
    }
    y += 20;
    pdf.font('Helvetica').fillColor('#000');
  };
  cabecera();

  const limite = pdf.page.height - 200;
  for (const l of doc.lineas) {
    const valores = {
      descripcion: l.descripcion || '',
      cantidad: num(l.cantidad, 3),
      precio: eur(l.precio),
      dto: Number(l.dto) ? `${num(l.dto)} %` : '',
      iva: l.suplido ? 'Suplido' : (OPERACIONES[l.operacion || 'S1']?.conIva ? `${num(l.iva)} %` : OPERACIONES[l.operacion].corto),
      recargo: Number(l.recargo) ? `${num(l.recargo)} %` : '',
      irpf: Number(l.irpf) ? `${num(l.irpf)} %` : '',
      importe: eur(baseLinea(l)),
    };
    pdf.fontSize(9);
    const alto = Math.max(pdf.heightOfString(valores.descripcion, { width: cols[0].w - 12 }), 11) + 10;
    if (y + alto > limite) {
      pdf.addPage();
      y = M;
      cabecera();
    }
    let x = M;
    for (const col of cols) {
      pdf.fillColor('#000').text(valores[col.k], x + 6, y + 5, { width: col.w - 12, align: col.a });
      x += col.w;
    }
    y += alto;
    pdf.moveTo(M, y).lineTo(M + ancho, y).lineWidth(0.5).strokeColor(LINEA).stroke();
  }

  // Bloque final: desglose de impuestos + totales
  const t = doc.totales;
  if (sinValorar) {
    y += 14;
    pdf.fontSize(8).fillColor(GRIS).text('Documento sin valorar: no incluye precios ni importes.', M, y, { width: ancho });
    y = pdf.y + 12;
  }
  if (!sinValorar && y + 190 > pdf.page.height - M) { pdf.addPage(); y = M; }
  if (!sinValorar) {
  y += 14;
  const xT = M + ancho - 220;

  // Desglose IVA (izquierda)
  pdf.fontSize(8).fillColor(GRIS).text('BASE', M, y, { width: 90 })
    .text('TIPO', M + 90, y, { width: 80, align: 'right' })
    .text('CUOTA', M + 170, y, { width: 70, align: 'right' });
  let yd = y + 12;
  pdf.fontSize(9).fillColor('#000');
  for (const d of t.desglose) {
    const etiqueta = OPERACIONES[d.operacion].conIva ? `IVA ${num(d.tipo)} %` : OPERACIONES[d.operacion].corto;
    pdf.text(eur(d.base), M, yd, { width: 90 })
      .text(etiqueta, M + 90, yd, { width: 80, align: 'right' })
      .text(eur(d.cuota), M + 170, yd, { width: 70, align: 'right' });
    yd += 13;
    if (d.cuotaRecargo) {
      pdf.text(eur(d.base), M, yd, { width: 90 })
        .text(`R.E. ${num(d.recargo)} %`, M + 90, yd, { width: 80, align: 'right' })
        .text(eur(d.cuotaRecargo), M + 170, yd, { width: 70, align: 'right' });
      yd += 13;
    }
  }
  for (const d of t.desgloseIrpf) {
    pdf.text(eur(d.base), M, yd, { width: 90 })
      .text(`IRPF ${num(d.tipo)} %`, M + 90, yd, { width: 80, align: 'right' })
      .text(`-${eur(d.cuota)}`, M + 170, yd, { width: 70, align: 'right' });
    yd += 13;
  }

  // Totales (derecha)
  const filas = [
    ['Base imponible', eur(t.neto)],
    ['IVA', eur(t.totalIva)],
    t.totalRecargo ? ['Recargo de equivalencia', eur(t.totalRecargo)] : null,
    t.totalIrpf ? ['Retención IRPF', `-${eur(t.totalIrpf)}`] : null,
    t.totalSuplidos ? ['Suplidos', eur(t.totalSuplidos)] : null,
  ].filter(Boolean);
  let yt = y;
  pdf.fontSize(9);
  for (const [k, v] of filas) {
    pdf.fillColor(GRIS).text(k, xT, yt, { width: 120 });
    pdf.fillColor('#000').text(v, xT + 120, yt, { width: 100, align: 'right' });
    yt += 15;
  }
  pdf.rect(xT, yt + 2, 220, 28).fill(AZUL);
  pdf.fillColor('#fff').font('Helvetica-Bold').fontSize(11).text('TOTAL', xT + 10, yt + 11, { width: 100 });
  pdf.text(eur(t.total), xT + 100, yt + 11, { width: 110, align: 'right' });
  pdf.font('Helvetica');
  y = Math.max(yd, yt + 40) + 16;

  // Leyendas legales de las operaciones exentas, no sujetas o con inversión del sujeto pasivo
  if (t.leyendas.length) {
    pdf.fontSize(8).fillColor('#000').text(t.leyendas.join('\n'), M, y, { width: ancho });
    y = pdf.y + 8;
  }
  }
  if (doc.tipo === 'proforma') {
    pdf.fontSize(8).fillColor(GRIS).text('Factura proforma: documento sin validez fiscal. No sustituye a la factura.', M, y, { width: ancho });
    y = pdf.y + 8;
  }

  // Forma de pago y observaciones
  pdf.fontSize(9).fillColor('#000');
  if (formaPago && ['factura', 'proforma'].includes(doc.tipo) && !sinValorar) {
    let txt = `Forma de pago: ${formaPago.descripcion}`;
    if (formaPago.muestra_iban && empresa.iban) txt += `  ·  IBAN: ${empresa.iban.replace(/(.{4})/g, '$1 ').trim()}`;
    pdf.text(txt, M, y, { width: ancho });
    y = pdf.y + 6;
  }
  if (vencimientos && !sinValorar) {
    pdf.fillColor(GRIS).fontSize(8).text('VENCIMIENTOS', M, y);
    y = pdf.y + 2;
    pdf.fillColor('#000').fontSize(9);
    for (const r of vencimientos) {
      pdf.text(fecha(r.vencimiento), M, y, { width: 80 }).text(eur(r.importe), M + 80, y, { width: 90, align: 'right' });
      y = pdf.y + 1;
    }
    y += 6;
  }
  if (doc.observaciones) {
    pdf.fillColor(GRIS).fontSize(8).text('OBSERVACIONES', M, y);
    pdf.fillColor('#000').fontSize(9).text(doc.observaciones, M, pdf.y + 2, { width: ancho });
  }
  // Recuadro de firma del receptor (albaranes)
  if (firma) {
    if (y + 110 > pdf.page.height - 60) { pdf.addPage(); y = M; }
    y += 10;
    const ancho2 = Math.min(260, ancho);
    const x2 = M + ancho - ancho2;
    pdf.rect(x2, y, ancho2, 96).lineWidth(0.7).strokeColor(LINEA).stroke();
    pdf.fontSize(8).fillColor(GRIS).text('RECIBÍ CONFORME', x2 + 10, y + 8);
    if (firma.nombre) {
      if (firma.imagen) {
        try { pdf.image(firma.imagen, x2 + 10, y + 20, { fit: [ancho2 - 20, 44] }); } catch { /* imagen dañada */ }
      }
      pdf.fontSize(8.5).fillColor('#000')
        .text(`${firma.nombre}${firma.dni ? ` · DNI ${firma.dni}` : ''}`, x2 + 10, y + 68, { width: ancho2 - 20 })
        .fillColor(GRIS).text(firma.fecha ? new Date(firma.fecha).toLocaleString('es-ES', { timeZone: process.env.TZ || 'Europe/Madrid' }) : '', x2 + 10, y + 80, { width: ancho2 - 20 });
    } else {
      pdf.fontSize(8).fillColor(GRIS)
        .text('Nombre:', x2 + 10, y + 30).text('DNI:', x2 + 10, y + 48).text('Firma:', x2 + 10, y + 66);
    }
    y += 106;
  }
  if (doc.estado === 'borrador') {
    pdf.save().rotate(-30, { origin: [W / 2, pdf.page.height / 2] })
      .fontSize(90).fillColor('#D13438').fillOpacity(0.12)
      .text('BORRADOR', 0, pdf.page.height / 2 - 50, { width: W, align: 'center' }).restore();
    pdf.fillOpacity(1);
  }

  // Plugins que añaden algo al final del documento (p. ej. un QR de pago), antes del pie
  if (typeof alFinal === 'function') y = alFinal(pdf, y, { limite: pdf.page.height - 75, margen: M }) ?? y;

  // Pie en todas las páginas
  const rango = pdf.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    pdf.switchToPage(i);
    const yp = pdf.page.height - 40;
    pdf.page.margins.bottom = 0;
    if (empresa.pie_factura) {
      pdf.fontSize(7).fillColor(GRIS).text(empresa.pie_factura, M, yp - 26, { width: ancho, align: 'center', height: 24, ellipsis: true });
    }
    pdf.fontSize(8).fillColor(GRIS).text(`${i + 1} / ${rango.count}`, M, yp, { width: ancho, align: 'right' });
  }
  return pdf;
}
