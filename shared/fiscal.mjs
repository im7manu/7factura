// Reglas fiscales compartidas por el servidor y la interfaz (una sola fuente de verdad).
//
// Calificación de cada línea según el IVA (misma clasificación que usa VERI*FACTU):
//   S1  Sujeta y no exenta            S2  Sujeta con inversión del sujeto pasivo
//   N1  No sujeta (arts. 7, 14…)       N2  No sujeta por reglas de localización
//   E1…E6  Exenta (arts. 20, 21, 22, 23-24, 25 y otros)
// Las líneas marcadas como «suplido» son gastos pagados en nombre del cliente: no forman parte
// de la base imponible ni llevan IVA, pero se suman al total a cobrar.

export const OPERACIONES = {
  S1: { nombre: 'Sujeta y no exenta', corto: 'Sujeta', conIva: true, leyenda: null },
  S2: {
    nombre: 'Inversión del sujeto pasivo', corto: 'ISP', conIva: false,
    leyenda: 'Operación con inversión del sujeto pasivo (art. 84.Uno.2º de la Ley 37/1992 del IVA).',
  },
  N1: {
    nombre: 'No sujeta (arts. 7, 14 y otros)', corto: 'No sujeta', conIva: false,
    leyenda: 'Operación no sujeta al IVA (arts. 7 y 14 de la Ley 37/1992).',
  },
  N2: {
    nombre: 'No sujeta por reglas de localización', corto: 'No sujeta (loc.)', conIva: false,
    leyenda: 'Operación no sujeta al IVA en el territorio de aplicación del impuesto por las reglas de localización (arts. 68 a 70 de la Ley 37/1992).',
  },
  E1: { nombre: 'Exenta (art. 20)', corto: 'Exenta art. 20', conIva: false, leyenda: 'Operación exenta de IVA (art. 20 de la Ley 37/1992).' },
  E2: { nombre: 'Exenta por exportación (art. 21)', corto: 'Exportación', conIva: false, leyenda: 'Operación exenta de IVA por exportación (art. 21 de la Ley 37/1992).' },
  E3: { nombre: 'Exenta, asimilada a exportación (art. 22)', corto: 'Exenta art. 22', conIva: false, leyenda: 'Operación exenta de IVA (art. 22 de la Ley 37/1992).' },
  E4: { nombre: 'Exenta (arts. 23 y 24)', corto: 'Exenta art. 23-24', conIva: false, leyenda: 'Operación exenta de IVA (arts. 23 y 24 de la Ley 37/1992).' },
  E5: { nombre: 'Entrega intracomunitaria exenta (art. 25)', corto: 'Intracomunitaria', conIva: false, leyenda: 'Entrega intracomunitaria exenta de IVA (art. 25 de la Ley 37/1992).' },
  E6: { nombre: 'Exenta por otros motivos', corto: 'Exenta', conIva: false, leyenda: 'Operación exenta de IVA.' },
};

export const TIPOS_IVA = [21, 10, 4, 0];
export const TIPOS_IRPF = [0, 1, 2, 7, 15, 19];
/** Recargo de equivalencia que corresponde a cada tipo de IVA. */
export const RECARGO_POR_IVA = { 21: 5.2, 10: 1.4, 4: 0.5, 0: 0 };

export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function baseLinea(l) {
  return r2(Number(l.cantidad || 0) * Number(l.precio || 0) * (1 - Number(l.dto || 0) / 100));
}

/** IVA y recargo efectivos de una línea (0 si la operación no lleva IVA o es un suplido). */
export function impuestosLinea(l) {
  const op = OPERACIONES[l.operacion || 'S1'] || OPERACIONES.S1;
  if (l.suplido || !op.conIva) return { iva: 0, recargo: 0 };
  return { iva: Number(l.iva || 0), recargo: Number(l.recargo || 0) };
}

/**
 * Totales de un documento.
 * desglose: una fila por (operación, tipo de IVA, recargo) con su base y cuotas.
 */
export function calcularTotales(lineas) {
  const grupos = new Map();
  const irpf = new Map();
  let neto = 0;
  let suplidos = 0;
  for (const l of lineas) {
    const base = baseLinea(l);
    if (l.suplido) { suplidos += base; continue; }
    neto += base;
    const op = OPERACIONES[l.operacion || 'S1'] ? (l.operacion || 'S1') : 'S1';
    const { iva, recargo } = impuestosLinea(l);
    const clave = `${op}|${iva}|${recargo}`;
    const g = grupos.get(clave) || { operacion: op, tipo: iva, recargo, base: 0 };
    g.base = r2(g.base + base);
    grupos.set(clave, g);
    const tr = Number(l.irpf || 0);
    if (tr) irpf.set(tr, r2((irpf.get(tr) || 0) + base));
  }
  const desglose = [...grupos.values()]
    .sort((a, b) => a.operacion.localeCompare(b.operacion) || b.tipo - a.tipo)
    .map((g) => ({ ...g, cuota: r2(g.base * g.tipo / 100), cuotaRecargo: r2(g.base * g.recargo / 100) }));
  const desgloseIrpf = [...irpf.entries()].sort((a, b) => b[0] - a[0])
    .map(([tipo, base]) => ({ tipo, base, cuota: r2(base * tipo / 100) }));
  const totalIva = r2(desglose.reduce((s, d) => s + d.cuota, 0));
  const totalRecargo = r2(desglose.reduce((s, d) => s + d.cuotaRecargo, 0));
  const totalIrpf = r2(desgloseIrpf.reduce((s, d) => s + d.cuota, 0));
  neto = r2(neto);
  suplidos = r2(suplidos);
  const leyendas = [...new Set(desglose.map((d) => OPERACIONES[d.operacion].leyenda).filter(Boolean))];
  return {
    neto, totalIva, totalRecargo, totalIrpf, totalSuplidos: suplidos,
    total: r2(neto + totalIva + totalRecargo - totalIrpf + suplidos),
    desglose, desgloseIrpf, leyendas,
    // compatibilidad: desglose solo de operaciones con IVA
    desgloseIva: desglose.filter((d) => OPERACIONES[d.operacion].conIva),
  };
}

/** Compone el código visible de un documento a partir de una plantilla: {num}, {num4}, {año}, {aa}, {serie}. */
export function componerCodigo(formato, { numero, ejercicio, serie }) {
  const f = formato || '{num}/{año}';
  return f
    .replaceAll('{num4}', String(numero).padStart(4, '0'))
    .replaceAll('{num}', String(numero))
    .replaceAll('{año}', String(ejercicio))
    .replaceAll('{anio}', String(ejercicio))
    .replaceAll('{aa}', String(ejercicio).slice(-2))
    .replaceAll('{serie}', serie || '');
}
