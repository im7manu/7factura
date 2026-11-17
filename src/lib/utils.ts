import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const fmtEur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const fmtNum = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

export const eur = (n: number | null | undefined) => fmtEur.format(Number(n) || 0);
export const num = (n: number | null | undefined) => fmtNum.format(Number(n) || 0);
export const fecha = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
/** Fecha local (no UTC) en formato AAAA-MM-DD. */
export const hoyIso = () => new Date().toLocaleDateString("sv-SE");

// Cálculo fiscal compartido con el servidor (shared/fiscal.mjs)
export { baseLinea, calcularTotales, impuestosLinea, OPERACIONES, RECARGO_POR_IVA, TIPOS_IVA, TIPOS_IRPF } from "@shared/fiscal.mjs";

/** Rutas y nombres de cada tipo de documento. */
export const TIPOS_DOC = {
  factura: { ruta: "/facturas", nueva: "/facturas/nueva", singular: "Factura", plural: "Facturas", nuevo: "Nueva factura" },
  presupuesto: { ruta: "/presupuestos", nueva: "/presupuestos/nuevo", singular: "Presupuesto", plural: "Presupuestos", nuevo: "Nuevo presupuesto" },
  proforma: { ruta: "/proformas", nueva: "/proformas/nueva", singular: "Proforma", plural: "Proformas", nuevo: "Nueva proforma" },
  pedido: { ruta: "/pedidos", nueva: "/pedidos/nuevo", singular: "Pedido", plural: "Pedidos", nuevo: "Nuevo pedido" },
  albaran: { ruta: "/albaranes", nueva: "/albaranes/nuevo", singular: "Albarán", plural: "Albaranes", nuevo: "Nuevo albarán" },
  presupuesto_compra: { ruta: "/compras/presupuestos", nueva: "/compras/presupuestos/nuevo", singular: "Presupuesto de proveedor", plural: "Presupuestos de proveedor", nuevo: "Nuevo presupuesto de proveedor" },
  pedido_compra: { ruta: "/compras/pedidos", nueva: "/compras/pedidos/nuevo", singular: "Pedido a proveedor", plural: "Pedidos a proveedor", nuevo: "Nuevo pedido a proveedor" },
  albaran_compra: { ruta: "/compras/albaranes", nueva: "/compras/albaranes/nuevo", singular: "Albarán de proveedor", plural: "Albaranes de proveedor", nuevo: "Nuevo albarán de proveedor" },
  factura_compra: { ruta: "/compras/facturas", nueva: "/compras/facturas/nueva", singular: "Factura recibida", plural: "Facturas recibidas", nuevo: "Registrar factura" },
  gasto: { ruta: "/compras/gastos", nueva: "/compras/gastos/nuevo", singular: "Gasto", plural: "Gastos y tickets", nuevo: "Nuevo gasto" },
} as const;

/** ¿El documento es de compras (el tercero es un proveedor)? */
export const esCompra = (tipo: string) => ["presupuesto_compra", "pedido_compra", "albaran_compra", "factura_compra", "gasto"].includes(tipo);
/** ¿El documento tiene vencimientos y cobros/pagos? */
export const conRecibos = (tipo: string) => ["factura", "factura_compra", "gasto"].includes(tipo);

/** A qué se puede convertir cada tipo de documento (igual que en el servidor). */
export const CONVERSIONES: Record<string, readonly (keyof typeof TIPOS_DOC)[]> = {
  presupuesto: ["pedido", "albaran", "proforma", "factura"],
  proforma: ["factura"],
  pedido: ["albaran", "factura"],
  albaran: ["factura"],
  presupuesto_compra: ["pedido_compra", "albaran_compra", "factura_compra"],
  pedido_compra: ["albaran_compra", "factura_compra"],
  albaran_compra: ["factura_compra"],
};

/** Validación de NIF/NIE/CIF en el navegador (la definitiva la hace el servidor). */
export function nifValido(valor: string) {
  const v = valor.toUpperCase().replace(/[\s.-]/g, "");
  const L = "TRWAGMYFPDXBNJZSQVHLCKE";
  if (/^\d{8}[A-Z]$/.test(v)) return L[Number(v.slice(0, 8)) % 23] === v[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) return L[Number("XYZ".indexOf(v[0]) + v.slice(1, 8)) % 23] === v[8];
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
    let s = 0;
    for (let i = 0; i < 7; i++) {
      let d = Number(v[i + 1]);
      if (i % 2 === 0) { d *= 2; d = Math.floor(d / 10) + (d % 10); }
      s += d;
    }
    const c = (10 - (s % 10)) % 10;
    return v[8] === String(c) || v[8] === "JABCDEFGHI"[c];
  }
  return false;
}
