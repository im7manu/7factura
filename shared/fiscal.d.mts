export type CodigoOperacion = "S1" | "S2" | "N1" | "N2" | "E1" | "E2" | "E3" | "E4" | "E5" | "E6";

export interface Operacion { nombre: string; corto: string; conIva: boolean; leyenda: string | null }
export const OPERACIONES: Record<CodigoOperacion, Operacion>;
export const TIPOS_IVA: number[];
export const TIPOS_IRPF: number[];
export const RECARGO_POR_IVA: Record<number, number>;

export interface LineaFiscal {
  cantidad: number; precio: number; dto: number; iva: number; irpf: number;
  recargo?: number; operacion?: CodigoOperacion | string; suplido?: boolean | number;
}
export interface FilaDesglose { operacion: CodigoOperacion; tipo: number; recargo: number; base: number; cuota: number; cuotaRecargo: number }
export interface Totales {
  neto: number; totalIva: number; totalRecargo: number; totalIrpf: number; totalSuplidos: number; total: number;
  desglose: FilaDesglose[]; desgloseIva: FilaDesglose[]; desgloseIrpf: { tipo: number; base: number; cuota: number }[]; leyendas: string[];
}

export function r2(n: number): number;
export function baseLinea(l: Pick<LineaFiscal, "cantidad" | "precio" | "dto">): number;
export function impuestosLinea(l: LineaFiscal): { iva: number; recargo: number };
export function calcularTotales(lineas: LineaFiscal[]): Totales;
export function componerCodigo(formato: string | null | undefined, d: { numero: number; ejercicio: number; serie?: string }): string;
