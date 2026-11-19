import type { CodigoOperacion, Totales } from "@shared/fiscal.mjs";

// Cliente HTTP mínimo para la API del servidor.
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function peticion<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(`/api${ruta}`, {
    method: metodo,
    credentials: "same-origin",
    headers: cuerpo !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = r.headers.get("content-type")?.includes("json") ? await r.json() : null;
  if (!r.ok) {
    if (r.status === 401 && !ruta.startsWith("/login")) window.dispatchEvent(new Event("sesion-caducada"));
    // Falta verificar el teléfono: se recarga el estado para mostrar la pantalla de verificación
    if (r.status === 403 && datos?.verificarTelefono) window.dispatchEvent(new Event("sesion-caducada"));
    throw new ApiError(datos?.error || `Error ${r.status}`, r.status);
  }
  return datos as T;
}

export const api = {
  get: <T>(ruta: string) => peticion<T>("GET", ruta),
  post: <T>(ruta: string, cuerpo: unknown = {}) => peticion<T>("POST", ruta, cuerpo),
  put: <T>(ruta: string, cuerpo: unknown) => peticion<T>("PUT", ruta, cuerpo),
  del: <T>(ruta: string) => peticion<T>("DELETE", ruta),
};

// ---- Tipos compartidos ----
export interface Empresa {
  razon_social: string; nif: string; direccion: string; cp: string; ciudad: string; provincia: string;
  telefono: string; email: string; iban: string; pie_factura: string;
}
export interface Usuario { id: number; usuario: string; nombre: string; email: string; rol: "admin" | "usuario"; verificar_telefono?: boolean; passkeys?: number }
export interface Cliente {
  id: number; nombre: string; nif: string; direccion: string; cp: string; ciudad: string; provincia: string; pais: string;
  email: string; telefono: string; forma_pago: string | null; notas: string; operacion: CodigoOperacion; recargo: number;
  plazos: Plazo[] | null; dias_pago: string;
  num_facturas?: number; pendiente?: number;
}
export interface Producto { id: number; referencia: string; descripcion: string; precio: number; iva: number; activo: number }
export interface Serie { codigo: string; descripcion: string; tipo: "normal" | "rectificativa" | "simplificada"; formato: string }
export interface Plazo { dias: number; pct: number }
export interface FormaPago { codigo: string; descripcion: string; dias: number; muestra_iban: number; plazos: Plazo[] | null }
export interface Cobro { id: number; recibo_id: number; fecha: string; importe: number; forma_pago: string | null; notas: string; usuario: string | null }
export interface Recibo {
  id: number; documento_id: number; numero: number; importe: number; vencimiento: string; forma_pago: string | null; notas: string;
  cobros: Cobro[]; cobrado: number; pendiente: number;
}
export interface AjustesCobros {
  recibos_por_plazos: boolean; cobros_parciales: boolean; menu_cobros: boolean; panel_en_factura: boolean; vencimientos_en_pdf: boolean;
  avisos: boolean; aviso_dias_antes: number; aviso_impagado_dias: number; avisos_en_inicio: boolean;
}
export interface AvisoRecibo { id: number; numero: number; vencimiento: string; documento_id: number; codigo: string; cliente_nombre: string; pendiente: number }
export interface Avisos { activos: boolean; en_inicio?: boolean; proximos: AvisoRecibo[]; impagados: AvisoRecibo[]; pagos?: AvisoRecibo[] }
export interface Linea {
  id?: number; producto_id: number | null; descripcion: string; cantidad: number; precio: number; dto: number; iva: number; irpf: number;
  recargo: number; operacion: CodigoOperacion; suplido: boolean; vehiculo_id?: number | null;
}
export type { Totales, FilaDesglose, CodigoOperacion } from "@shared/fiscal.mjs";
export type TipoDoc = "factura" | "presupuesto" | "proforma" | "pedido" | "albaran" | "presupuesto_compra" | "pedido_compra" | "albaran_compra" | "factura_compra" | "gasto";
export interface DocumentoResumen {
  id: number; tipo: TipoDoc; serie: string; codigo: string | null; fecha: string; vencimiento: string | null; estado: string;
  neto: number; total_iva: number; total_irpf: number; total: number; rectifica_id: number | null; cliente_nombre: string | null; cliente_nif: string | null;
  referencia: string; cobrado?: number; firma_nombre?: string | null; numero_proveedor?: string;
}
export interface Documento extends DocumentoResumen {
  ejercicio: number; numero: number | null; cliente_id: number | null; cliente: Partial<Cliente>; forma_pago: string | null;
  observaciones: string; motivo: string; origen_id: number | null; huella: string | null; huella_anterior: string | null;
  emitida_en: string | null; pagada_en: string | null; lineas: Linea[]; totales: Totales; serie_tipo: Serie["tipo"] | null;
  num_adjuntos: number; cobrado: number; recibos: Recibo[]; valorado: boolean;
  firma_nombre: string | null; firma_dni: string | null; firma_fecha: string | null; firma_adjunto_id: number | null;
  origenes: { id: number; codigo: string | null; tipo: TipoDoc; fecha: string }[];
  proveedor_id: number | null; numero_proveedor: string; deducible: boolean;
  rectificada?: { id: number; codigo: string; fecha: string };
  rectificativas: { id: number; codigo: string | null; estado: string; total: number }[];
  origen?: { id: number; codigo: string | null; tipo: TipoDoc };
  derivados: { id: number; codigo: string | null; tipo: TipoDoc; estado: string }[];
}
export interface Ajustes {
  empresa: Empresa; serie_defecto: string; series: Serie[]; formas_pago: FormaPago[]; registro_plugins: string | null;
  formatos: { presupuesto: string; proforma: string };
  cobros: AjustesCobros;
  ventas: AjustesVentas;
  compras: AjustesCompras;
}
export interface AjustesCompras {
  presupuestos_compra: boolean; pedidos_compra: boolean; albaranes_compra: boolean; gastos: boolean; gasto_pagado: boolean;
  gasto_deducible: boolean; vehiculos: boolean; menu_pagos: boolean;
}
export type Proveedor = Cliente;
export interface Vehiculo { id: number; uid: string; matricula: string; tipo: string; modelo: string; estado: string; itv: string; notas: string; activo: number; gasto_anio?: number }
export interface Conductor { id: number; uid: string; nombre: string; dni: string; telefono: string; email: string; activo: number }
export interface AjustesVentas { pedidos: boolean; albaranes: boolean; albaran_valorado: boolean; indicar_albaran_en_factura: boolean; facturar_mes_emitir: boolean }
export interface Adjunto { id: number; nombre: string; mime: string; tamano: number; creado: string; subido_por: string | null }

// ---- Correo ----
export interface CuentaCorreo { proveedor: "google" | "microsoft" | "smtp"; email: string; nombre: string; firma: string; conectado: string }
export interface AdjuntoCorreo { id: string; nombre: string; tipo: string; tamano?: number; marcado: boolean }
export interface BorradorCorreo { cuenta: CuentaCorreo | null; para: string; cc: string; cco: string; asunto: string; cuerpo: string; adjuntos: AdjuntoCorreo[] }
export interface CorreoEnviado {
  id: number; desde: string; proveedor: string; para: string; cc: string; cco: string; asunto: string; cuerpo: string;
  adjuntos: string[]; estado: "enviado" | "error"; error: string | null; fecha: string; usuario: string | null;
}
export interface AppOAuth { client_id: string; configurado: boolean; tenant?: string }
export interface EstadoCorreo {
  cuenta: CuentaCorreo | null; disponibles: { google: boolean; microsoft: boolean; smtp: boolean }; url_retorno: string;
  mis_apps: { google: AppOAuth | null; microsoft: AppOAuth | null };
}
