// Validación de identificadores fiscales españoles (NIF/DNI, NIE, CIF).
const LETRAS = 'TRWAGMYFPDXBNJZSQVHLCKE';

export function normalizarNif(v) {
  return String(v || '').toUpperCase().replace(/[\s.-]/g, '');
}

export function validarNif(valor) {
  const v = normalizarNif(valor);
  if (!v) return { valido: false, tipo: null };

  // DNI: 8 dígitos + letra
  if (/^\d{8}[A-Z]$/.test(v)) {
    return { valido: LETRAS[Number(v.slice(0, 8)) % 23] === v[8], tipo: 'DNI' };
  }
  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) {
    const num = 'XYZ'.indexOf(v[0]) + v.slice(1, 8);
    return { valido: LETRAS[Number(num) % 23] === v[8], tipo: 'NIE' };
  }
  // CIF: letra + 7 dígitos + control (dígito o letra)
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
    const digitos = v.slice(1, 8);
    let suma = 0;
    for (let i = 0; i < 7; i++) {
      let d = Number(digitos[i]);
      if (i % 2 === 0) { d *= 2; d = Math.floor(d / 10) + (d % 10); }
      suma += d;
    }
    const control = (10 - (suma % 10)) % 10;
    const letraControl = 'JABCDEFGHI'[control];
    const c = v[8];
    const soloLetra = 'KPQRSNW'.includes(v[0]);
    const soloNumero = 'ABEH'.includes(v[0]);
    const ok = soloLetra ? c === letraControl
      : soloNumero ? c === String(control)
      : c === String(control) || c === letraControl;
    return { valido: ok, tipo: 'CIF' };
  }
  return { valido: false, tipo: null };
}

// IBAN: comprobación mod 97 (ISO 13616)
export function validarIban(valor) {
  const v = String(valor || '').toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  const reordenado = v.slice(4) + v.slice(0, 4);
  const numerico = reordenado.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let resto = 0;
  for (const ch of numerico) resto = (resto * 10 + Number(ch)) % 97;
  return resto === 1;
}
