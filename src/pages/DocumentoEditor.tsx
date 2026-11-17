import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Ban, Check, CheckCircle2, ChevronDown, Mail, PenLine, Repeat, Copy, Download, EyeOff, FileCheck2, FileText, Plus, Receipt, RotateCcw, Save, Send, Trash2, Undo2, UserPlus,
} from "lucide-react";
import {
  api, type Ajustes, type Cliente, type CodigoOperacion, type Documento, type Linea, type Producto, type TipoDoc, type Vehiculo,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { CommandBar, EstadoBadge, Loading } from "@/components/ui/misc";
import { ClienteDialog } from "@/components/ClienteDialog";
import { Adjuntos } from "@/components/Adjuntos";
import { CobrosPanel } from "@/components/CobrosPanel";
import { FirmaDialog } from "@/components/FirmaDialog";
import { CorreoDialog } from "@/components/CorreoDialog";
import { CorreosEnviados } from "@/components/CorreosEnviados";
import {
  baseLinea, calcularTotales, conRecibos, CONVERSIONES, esCompra, eur, fecha, hoyIso, num, OPERACIONES, RECARGO_POR_IVA, TIPOS_DOC, TIPOS_IRPF, TIPOS_IVA,
} from "@/lib/utils";

const lineaVacia = (c?: Cliente): Linea => ({
  producto_id: null, descripcion: "", cantidad: 1, precio: 0, dto: 0, iva: 21, irpf: 0,
  operacion: c?.operacion || "S1", recargo: c?.recargo && (c.operacion || "S1") === "S1" ? RECARGO_POR_IVA[21] : 0, suplido: false,
});

/** Valor del selector «Impuesto» de cada línea: tipo de IVA, operación sin IVA o suplido. */
function valorImpuesto(l: Linea) {
  if (l.suplido) return "SUP";
  return OPERACIONES[l.operacion]?.conIva ? `S1:${l.iva}` : l.operacion;
}

interface Cabecera {
  serie: string; fecha: string; vencimiento: string; cliente_id: number | null; forma_pago: string; referencia: string; observaciones: string; motivo: string;
  valorado: boolean; numero_proveedor: string; deducible: boolean;
}

export default function DocumentoEditor({ tipo }: { tipo: TipoDoc }) {
  const { id } = useParams();
  const nuevo = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const info = TIPOS_DOC[tipo];
  const compra = esCompra(tipo);
  const tercero = compra ? "proveedor" : "cliente";

  const ajustes = useQuery({ queryKey: ["ajustes"], queryFn: () => api.get<Ajustes>("/ajustes") });
  const clientes = useQuery({ queryKey: [compra ? "proveedores" : "clientes"], queryFn: () => api.get<Cliente[]>(compra ? "/proveedores" : "/clientes") });
  const vehiculos = useQuery({ queryKey: ["vehiculos"], queryFn: () => api.get<Vehiculo[]>("/vehiculos"), enabled: compra });
  const productos = useQuery({ queryKey: ["productos"], queryFn: () => api.get<Producto[]>("/productos") });
  const doc = useQuery({ queryKey: ["documento", id], queryFn: () => api.get<Documento>(`/documentos/${id}`), enabled: !nuevo });

  const [cab, setCab] = useState<Cabecera | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [sucio, setSucio] = useState(false);
  const [dlgCliente, setDlgCliente] = useState(false);
  const [confirmar, setConfirmar] = useState<null | "emitir" | "borrar" | "rectificar">(null);
  const [motivo, setMotivo] = useState("");
  const [menuPdf, setMenuPdf] = useState(false);
  const [menuConv, setMenuConv] = useState(false);
  const [dlgFirma, setDlgFirma] = useState(false);
  const [dlgCorreo, setDlgCorreo] = useState(false);
  const menuPdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (nuevo && ajustes.data && !cab) {
      setCab({ serie: ajustes.data.serie_defecto, fecha: hoyIso(), vencimiento: "", cliente_id: null, forma_pago: "", referencia: "", observaciones: "", motivo: "",
        valorado: tipo === "albaran" ? ajustes.data.ventas.albaran_valorado : true,
        numero_proveedor: "", deducible: tipo === "gasto" ? ajustes.data.compras.gasto_deducible : true });
      setLineas([lineaVacia()]);
    }
  }, [nuevo, ajustes.data, cab]);
  useEffect(() => {
    if (doc.data) {
      const d = doc.data;
      setCab({ serie: d.serie, fecha: d.fecha, vencimiento: d.vencimiento || "", cliente_id: compra ? d.proveedor_id : d.cliente_id, forma_pago: d.forma_pago || "",
        referencia: d.referencia || "", observaciones: d.observaciones, motivo: d.motivo, valorado: d.valorado, numero_proveedor: d.numero_proveedor || "", deducible: d.deducible });
      setLineas(d.lineas.map(({ producto_id, descripcion, cantidad, precio, dto, iva, irpf, recargo, operacion, suplido, vehiculo_id }) => ({ producto_id, descripcion, cantidad, precio, dto, iva, irpf, recargo, operacion, suplido: !!suplido, vehiculo_id: vehiculo_id ?? null })));
      setSucio(false);
    }
  }, [doc.data]);
  useEffect(() => {
    if (!menuPdf) return;
    const cerrar = (e: MouseEvent) => { if (!menuPdfRef.current?.contains(e.target as Node)) setMenuPdf(false); };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [menuPdf]);

  const editable = nuevo || doc.data?.estado === "borrador";
  const totales = useMemo(() => calcularTotales(lineas), [lineas]);
  const clienteSel = clientes.data?.find((c) => c.id === cab?.cliente_id);
  const conRecargo = !!clienteSel?.recargo || lineas.some((l) => Number(l.recargo));

  const refrescar = (d: Documento) => {
    qc.setQueryData(["documento", String(d.id)], d);
    qc.invalidateQueries({ queryKey: ["documentos"] });
    qc.invalidateQueries({ queryKey: ["resumen"] });
  };
  const fallo = (e: unknown) => toast.error((e as Error).message);
  // En compras, el tercero elegido es un proveedor
  const payload = () => ({
    tipo, ...cab, vencimiento: cab?.vencimiento || null, forma_pago: cab?.forma_pago || null, lineas,
    ...(compra ? { proveedor_id: cab?.cliente_id ?? null, cliente_id: undefined } : {}),
  });
  const conVehiculos = compra && ajustes.data?.compras.vehiculos !== false && !!vehiculos.data?.some((v) => v.activo);

  const guardar = useMutation({
    mutationFn: async () => (nuevo ? api.post<Documento>("/documentos", payload()) : api.put<Documento>(`/documentos/${id}`, payload())),
    onSuccess: (d) => {
      refrescar(d);
      setSucio(false);
      toast.success("Borrador guardado");
      if (nuevo) navigate(`${info.ruta}/${d.id}`, { replace: true });
    },
    onError: fallo,
  });

  const accion = useMutation({
    mutationFn: async ({ ruta, cuerpo }: { ruta: string; cuerpo?: unknown }) => {
      if (ruta === "emitir" && sucio) await api.put(`/documentos/${id}`, payload());
      return api.post<Documento>(`/documentos/${id}/${ruta}`, cuerpo ?? {});
    },
    onSuccess: (d, { ruta }) => {
      setConfirmar(null);
      if (["rectificar", "duplicar", "facturar"].includes(ruta)) {
        qc.invalidateQueries({ queryKey: ["documentos"] });
        toast.success(ruta === "rectificar" ? "Rectificativa creada como borrador" : ruta === "facturar" ? "Factura creada como borrador" : "Copia creada");
        navigate(`${TIPOS_DOC[d.tipo].ruta}/${d.id}`);
      } else {
        refrescar(d);
        toast.success(ruta === "emitir" ? `${info.singular} ${d.codigo} emitido` : "Estado actualizado");
      }
    },
    onError: fallo,
  });

  const firmar = useMutation({
    mutationFn: (f: { nombre: string; dni: string; imagen: string | null }) => api.post<Documento>(`/documentos/${id}/firma`, f),
    onSuccess: (d) => { refrescar(d); setDlgFirma(false); qc.invalidateQueries({ queryKey: ["adjuntos"] }); toast.success("Albarán firmado"); },
    onError: fallo,
  });
  const quitarFirma = useMutation({
    mutationFn: () => api.del<Documento>(`/documentos/${id}/firma`),
    onSuccess: (d) => { refrescar(d); toast.success("Firma quitada"); },
    onError: fallo,
  });
  const convertir = useMutation({
    mutationFn: (destino: string) => api.post<Documento>(`/documentos/${id}/convertir`, { destino }),
    onSuccess: (d) => { setMenuConv(false); qc.invalidateQueries({ queryKey: ["documentos"] }); toast.success(`${TIPOS_DOC[d.tipo].singular} creado como borrador`); navigate(`${TIPOS_DOC[d.tipo].ruta}/${d.id}`); },
    onError: fallo,
  });

  const borrar = useMutation({
    mutationFn: () => api.del(`/documentos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documentos"] }); toast.success("Borrador eliminado"); navigate(info.ruta); },
    onError: fallo,
  });

  if (!cab || (!nuevo && !doc.data)) return doc.isError ? <p className="text-danger">{(doc.error as Error).message}</p> : <Loading />;
  const d = doc.data;

  const setC = <K extends keyof Cabecera>(k: K, v: Cabecera[K]) => { setCab({ ...cab, [k]: v }); setSucio(true); };
  const setL = (i: number, cambios: Partial<Linea>) => { setLineas(lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l))); setSucio(true); };

  /** Recargo de equivalencia que toca a una línea según el cliente. */
  const recargoPara = (l: Pick<Linea, "operacion" | "iva" | "suplido">) =>
    clienteSel?.recargo && l.operacion === "S1" && !l.suplido ? (RECARGO_POR_IVA[l.iva] ?? 0) : 0;

  const cambiarImpuesto = (i: number, v: string) => {
    const l = lineas[i];
    let cambios: Partial<Linea>;
    if (v === "SUP") cambios = { suplido: true, operacion: "S1", iva: 0, recargo: 0, irpf: 0 };
    else if (v.startsWith("S1:")) cambios = { suplido: false, operacion: "S1", iva: Number(v.slice(3)) };
    else cambios = { suplido: false, operacion: v as CodigoOperacion, iva: 0 };
    setL(i, { ...cambios, recargo: recargoPara({ ...l, ...cambios } as Linea) });
  };
  const elegirProducto = (i: number, pid: string) => {
    const p = productos.data?.find((x) => x.id === Number(pid));
    if (!p) return;
    const l = lineas[i];
    const base = { ...l, producto_id: p.id, descripcion: p.descripcion, precio: p.precio, iva: l.operacion === "S1" ? p.iva : 0 };
    setL(i, { ...base, recargo: recargoPara(base) });
  };
  const elegirCliente = (cid: number | null) => {
    const c = clientes.data?.find((x) => x.id === cid);
    setCab({ ...cab, cliente_id: cid, forma_pago: cab.forma_pago || c?.forma_pago || "" });
    // Aplica la calificación de IVA y el recargo habituales del cliente a las líneas
    if (c) {
      setLineas(lineas.map((l) => {
        if (l.suplido) return l;
        const operacion = l.operacion === "S1" && c.operacion !== "S1" ? c.operacion : l.operacion;
        const iva = OPERACIONES[operacion].conIva ? l.iva : 0;
        return { ...l, operacion, iva, recargo: c.recargo && operacion === "S1" ? (RECARGO_POR_IVA[iva] ?? 0) : 0 };
      }));
    }
    setSucio(true);
  };

  const titulo = nuevo ? info.nuevo
    : d?.codigo || (d?.rectifica_id ? "Rectificativa (borrador)" : `${info.singular} (borrador)`);
  const seriesFiltradas = ajustes.data?.series.filter((s) => (d?.rectifica_id ? s.tipo === "rectificativa" : s.tipo !== "rectificativa")) || [];
  const pdf = (opc: { descargar?: boolean; sinValorar?: boolean; valorar?: boolean } = {}) => {
    const sp = new URLSearchParams();
    if (opc.descargar) sp.set("descargar", "1");
    if (opc.sinValorar) sp.set("sin_valorar", "1");
    if (opc.valorar) sp.set("valorar", "1");
    window.open(`/api/documentos/${id}/pdf${sp.size ? `?${sp}` : ""}`, "_blank", "noopener");
    setMenuPdf(false);
  };
  const destinos = d && d.estado !== "borrador" && !["cancelado", "anulada", "rechazado", "facturado", "facturada"].includes(d.estado)
    ? (CONVERSIONES[d.tipo] || []).filter((t) => t !== "factura" || !d.derivados.some((x) => x.tipo === "factura"))
      .filter((t) => (t === "pedido" ? ajustes.data?.ventas.pedidos !== false : t === "albaran" ? ajustes.data?.ventas.albaranes !== false
        : t === "pedido_compra" ? ajustes.data?.compras.pedidos_compra !== false : t === "albaran_compra" ? ajustes.data?.compras.albaranes_compra !== false : true))
    : [];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link to={info.ruta} className="rounded p-1.5 text-muted hover:bg-subtle" aria-label="Volver"><ArrowLeft size={18} /></Link>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {d ? <EstadoBadge estado={d.estado} compra={compra} /> : null}
        {d?.numero_proveedor ? <span className="text-sm text-muted">· Nº proveedor {d.numero_proveedor}</span> : null}
        {d?.referencia ? <span className="text-sm text-muted">· Ref. {d.referencia}</span> : null}
        {sucio ? <span className="text-xs text-muted">· Cambios sin guardar</span> : null}
      </div>

      <CommandBar>
        {editable ? (
          <>
            <Button variant="subtle" onClick={() => guardar.mutate()} disabled={guardar.isPending}><Save size={16} /> Guardar borrador</Button>
            {!nuevo ? <Button variant="subtle" onClick={() => setConfirmar("emitir")}><Send size={16} /> {["factura_compra", "gasto", "albaran_compra"].includes(tipo) ? "Registrar" : "Emitir"}</Button> : null}
          </>
        ) : null}
        {!nuevo ? (
          <div className="relative" ref={menuPdfRef}>
            <div className="flex">
              <Button variant="subtle" className="rounded-r-none" onClick={() => pdf()}><FileText size={16} /> Ver PDF</Button>
              <Button variant="subtle" className="rounded-l-none px-1.5" onClick={() => setMenuPdf((v) => !v)} aria-label="Más opciones de PDF"><ChevronDown size={14} /></Button>
            </div>
            {menuPdf ? (
              <div className="card absolute left-0 top-9 z-20 w-56 p-1 shadow-flyout">
                <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-subtle" onClick={() => pdf({ descargar: true })}><Download size={15} /> Descargar PDF</button>
                {d?.tipo === "albaran" && !d.valorado ? (
                  <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-subtle" onClick={() => pdf({ valorar: true })}><FileText size={15} /> Ver valorado</button>
                ) : null}
                <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-subtle" onClick={() => pdf({ sinValorar: true })}><EyeOff size={15} /> Ver sin valorar</button>
                <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-subtle" onClick={() => pdf({ sinValorar: true, descargar: true })}><Download size={15} /> Descargar sin valorar</button>
              </div>
            ) : null}
          </div>
        ) : null}
        {d && d.estado !== "borrador" ? (
          <Button variant="subtle" onClick={() => setDlgCorreo(true)}><Mail size={16} /> Enviar por correo</Button>
        ) : null}
        {d && conRecibos(d.tipo) && d.estado === "emitida" ? (
          <Button variant="subtle" onClick={() => accion.mutate({ ruta: "estado", cuerpo: { estado: "pagada" } })}><CheckCircle2 size={16} /> {compra ? "Marcar pagada" : "Marcar cobrada"}</Button>
        ) : null}
        {d && conRecibos(d.tipo) && d.estado === "pagada" ? (
          <Button variant="subtle" onClick={() => accion.mutate({ ruta: "estado", cuerpo: { estado: "emitida" } })}><Undo2 size={16} /> Marcar pendiente</Button>
        ) : null}
        {(d?.tipo === "factura" || d?.tipo === "factura_compra") && d.estado !== "borrador" && !d.rectifica_id ? (
          <Button variant="subtle" onClick={() => { setMotivo(""); setConfirmar("rectificar"); }}><RotateCcw size={16} /> Rectificar</Button>
        ) : null}
        {d?.tipo === "presupuesto" && ["emitido", "rechazado"].includes(d.estado) ? (
          <Button variant="subtle" onClick={() => accion.mutate({ ruta: "estado", cuerpo: { estado: "aceptado" } })}><Check size={16} /> Aceptado</Button>
        ) : null}
        {d?.tipo === "presupuesto" && ["emitido", "aceptado"].includes(d.estado) ? (
          <Button variant="subtle" onClick={() => accion.mutate({ ruta: "estado", cuerpo: { estado: "rechazado" } })}><Ban size={16} /> Rechazado</Button>
        ) : null}
        {d?.tipo === "proforma" && d.estado === "emitida" ? (
          <Button variant="subtle" onClick={() => accion.mutate({ ruta: "estado", cuerpo: { estado: "anulada" } })}><Ban size={16} /> Anular</Button>
        ) : null}
        {d?.tipo === "proforma" && d.estado === "anulada" ? (
          <Button variant="subtle" onClick={() => accion.mutate({ ruta: "estado", cuerpo: { estado: "emitida" } })}><Undo2 size={16} /> Reactivar</Button>
        ) : null}
        {(d?.tipo === "pedido" || d?.tipo === "pedido_compra") && d.estado === "emitido" ? (
          <Button variant="subtle" onClick={() => accion.mutate({ ruta: "estado", cuerpo: { estado: "cancelado" } })}><Ban size={16} /> Cancelar pedido</Button>
        ) : null}
        {(d?.tipo === "pedido" || d?.tipo === "pedido_compra") && d.estado === "cancelado" ? (
          <Button variant="subtle" onClick={() => accion.mutate({ ruta: "estado", cuerpo: { estado: "emitido" } })}><Undo2 size={16} /> Reactivar</Button>
        ) : null}
        {d?.tipo === "albaran" && d.estado === "emitido" ? (
          <Button variant="subtle" onClick={() => setDlgFirma(true)}><PenLine size={16} /> Firmar</Button>
        ) : null}
        {destinos.length === 1 && (destinos[0] === "factura" || destinos[0] === "factura_compra") ? (
          <Button variant="subtle" onClick={() => convertir.mutate(destinos[0])} disabled={convertir.isPending}><Receipt size={16} /> {compra ? "Registrar factura" : "Crear factura"}</Button>
        ) : destinos.length ? (
          <div className="relative">
            <Button variant="subtle" onClick={() => setMenuConv((v) => !v)}><Repeat size={16} /> Convertir en… <ChevronDown size={14} /></Button>
            {menuConv ? (
              <div className="card absolute left-0 top-9 z-20 w-48 p-1 shadow-flyout">
                {destinos.map((t) => (
                  <button key={t} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-subtle" onClick={() => convertir.mutate(t)}>
                    {TIPOS_DOC[t].singular}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {!nuevo ? <Button variant="subtle" onClick={() => accion.mutate({ ruta: "duplicar" })}><Copy size={16} /> Duplicar</Button> : null}
        {editable && !nuevo ? <Button variant="subtle" className="text-danger" onClick={() => setConfirmar("borrar")}><Trash2 size={16} /> Eliminar</Button> : null}
      </CommandBar>

      {d?.rectificada ? (
        <p className="mb-3 rounded bg-brand-soft px-3 py-2 text-sm">
          Rectifica a la factura <Link className="font-semibold text-brand-fg hover:underline" to={`/facturas/${d.rectificada.id}`}>{d.rectificada.codigo}</Link> del {fecha(d.rectificada.fecha)}.
        </p>
      ) : null}
      {d?.rectificativas.length ? (
        <p className="mb-3 rounded bg-warning/10 px-3 py-2 text-sm">
          Esta factura tiene rectificativas: {d.rectificativas.map((r, i) => (
            <span key={r.id}>{i ? ", " : ""}<Link className="font-semibold text-brand-fg hover:underline" to={`/facturas/${r.id}`}>{r.codigo || "borrador"}</Link> ({eur(r.total)})</span>
          ))}
        </p>
      ) : null}
      {d?.origenes?.length ? (
        <p className="mb-3 rounded bg-brand-soft px-3 py-2 text-sm">
          Creado desde {d.origenes.map((o, i) => (
            <span key={o.id}>{i ? ", " : ""}{TIPOS_DOC[o.tipo].singular.toLowerCase()}{" "}
              <Link className="font-semibold text-brand-fg hover:underline" to={`${TIPOS_DOC[o.tipo].ruta}/${o.id}`}>{o.codigo}</Link></span>
          ))}.
        </p>
      ) : null}
      {d?.derivados.length ? (
        <p className="mb-3 rounded bg-success/10 px-3 py-2 text-sm">
          Continúa en {d.derivados.map((x, i) => (
            <span key={x.id}>{i ? ", " : ""}{TIPOS_DOC[x.tipo].singular.toLowerCase()}{" "}
              <Link className="font-semibold text-brand-fg hover:underline" to={`${TIPOS_DOC[x.tipo].ruta}/${x.id}`}>{x.codigo || "borrador"}</Link></span>
          ))}.
        </p>
      ) : null}
      {d?.tipo === "albaran" && d.estado !== "borrador" ? (
        d.firma_nombre ? (
          <div className="card mb-3 flex flex-wrap items-center gap-4 p-3 text-sm">
            {d.firma_adjunto_id ? <img src={`/api/adjuntos/${d.firma_adjunto_id}/descargar?ver=1`} alt="Firma del receptor" className="h-14 rounded border border-stroke bg-white px-2" /> : null}
            <div className="flex-1">
              <p className="font-semibold">Recibido por {d.firma_nombre}{d.firma_dni ? ` · DNI ${d.firma_dni}` : ""}</p>
              <p className="text-xs text-muted">{d.firma_fecha ? new Date(d.firma_fecha).toLocaleString("es-ES") : ""}</p>
            </div>
            {d.estado === "firmado" ? <Button size="sm" variant="subtle" onClick={() => confirm("¿Quitar la firma de este albarán?") && quitarFirma.mutate()}>Quitar firma</Button> : null}
          </div>
        ) : (
          <p className="mb-3 rounded bg-warning/10 px-3 py-2 text-sm">Albarán pendiente de firma. Pulsa «Firmar» para que el receptor firme en pantalla, o adjunta una foto del albarán firmado en papel.</p>
        )
      ) : null}
      {tipo === "proforma" ? (
        <p className="mb-3 rounded bg-subtle px-3 py-2 text-sm text-muted">Una proforma no es una factura: no cuenta para el IVA ni para los informes. Cuando se confirme, pulsa «Crear factura».</p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-4">
        <section className="card p-4 xl:col-span-3">
          <div className="grid gap-3 sm:grid-cols-6">
            <Field label={tipo === "gasto" ? "Proveedor o establecimiento (opcional)" : compra ? "Proveedor" : "Cliente"} className="sm:col-span-4">
              <div className="flex gap-1">
                <Select value={cab.cliente_id ?? ""} onChange={(e) => elegirCliente(e.target.value ? Number(e.target.value) : null)} disabled={!editable}>
                  <option value="">{compra ? "Selecciona un proveedor…" : "Selecciona un cliente…"}</option>
                  {clientes.data?.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.nif ? ` · ${c.nif}` : ""}</option>)}
                </Select>
                {editable ? <Button size="icon" onClick={() => setDlgCliente(true)} aria-label={`Nuevo ${tercero}`} title={`Nuevo ${tercero}`}><UserPlus size={16} /></Button> : null}
              </div>
              {!editable && d ? (
                <span className="mt-1 block text-xs text-muted">{[d.cliente.nif, d.cliente.direccion, d.cliente.ciudad].filter(Boolean).join(" · ")}</span>
              ) : clienteSel && !clienteSel.nif && (tipo === "factura" || tipo === "factura_compra") ? (
                <span className="mt-1 block text-xs text-warning">{compra ? "Este proveedor no tiene NIF: necesario para registrar su factura." : "Este cliente no tiene NIF: necesario para emitir una factura completa."}</span>
              ) : clienteSel?.recargo ? (
                <span className="mt-1 block text-xs text-muted">Cliente en recargo de equivalencia: se aplica automáticamente.</span>
              ) : null}
            </Field>
            {tipo === "factura" ? (
              <Field label="Serie" className="sm:col-span-2">
                <Select value={cab.serie} onChange={(e) => setC("serie", e.target.value)} disabled={!editable}>
                  {seriesFiltradas.map((s) => <option key={s.codigo} value={s.codigo}>{s.codigo} · {s.descripcion}</option>)}
                </Select>
              </Field>
            ) : (
              <Field label={compra ? "Referencia interna" : "Su referencia"} hint={compra ? "Opcional: obra, expediente, viaje…" : "Nº de pedido o albarán del cliente"} className="sm:col-span-2">
                <Input value={cab.referencia} onChange={(e) => setC("referencia", e.target.value)} disabled={!editable} maxLength={100} />
              </Field>
            )}
            <Field label="Fecha" className="sm:col-span-2"><Input type="date" value={cab.fecha} onChange={(e) => setC("fecha", e.target.value)} disabled={!editable} /></Field>
            {tipo !== "albaran" && tipo !== "albaran_compra" ? (
              <Field label={conRecibos(tipo) ? "Vencimiento" : tipo === "pedido" || tipo === "pedido_compra" ? "Entrega prevista" : "Válido hasta"}
                hint={(conRecibos(tipo) || tipo === "proforma") && editable ? "Vacío: según la forma de pago" : undefined} className="sm:col-span-2">
                <Input type="date" value={cab.vencimiento} onChange={(e) => setC("vencimiento", e.target.value)} disabled={!editable} />
              </Field>
            ) : null}
            <Field label="Forma de pago" className="sm:col-span-2">
              <Select value={cab.forma_pago} onChange={(e) => setC("forma_pago", e.target.value)} disabled={!editable}>
                <option value="">—</option>
                {ajustes.data?.formas_pago.map((f) => <option key={f.codigo} value={f.codigo}>{f.descripcion}</option>)}
              </Select>
            </Field>
            {tipo === "factura" ? (
              <Field label="Su referencia" hint="Nº de pedido o albarán del cliente" className="sm:col-span-3">
                <Input value={cab.referencia} onChange={(e) => setC("referencia", e.target.value)} disabled={!editable} maxLength={100} />
              </Field>
            ) : null}
            {["factura_compra", "albaran_compra", "gasto"].includes(tipo) ? (
              <Field label={tipo === "factura_compra" ? "Nº de la factura del proveedor *" : tipo === "gasto" ? "Nº de ticket" : "Nº del albarán del proveedor"} className="sm:col-span-2">
                <Input value={cab.numero_proveedor} onChange={(e) => setC("numero_proveedor", e.target.value)} disabled={!editable} maxLength={60} />
              </Field>
            ) : null}
            {["factura_compra", "gasto"].includes(tipo) ? (
              <label className="flex items-center gap-2 text-sm sm:col-span-4">
                <input type="checkbox" checked={cab.deducible} disabled={!editable} onChange={(e) => setC("deducible", e.target.checked)} />
                IVA deducible (cuenta como IVA soportado en el 303)
              </label>
            ) : null}
            {tipo === "albaran" ? (
              <label className="flex items-center gap-2 text-sm sm:col-span-3">
                <input type="checkbox" checked={cab.valorado} disabled={!editable} onChange={(e) => setC("valorado", e.target.checked)} />
                Albarán valorado (el PDF muestra precios e importes)
              </label>
            ) : null}
            {d?.rectifica_id ? (
              <Field label="Motivo de la rectificación *" className="sm:col-span-3"><Input value={cab.motivo} onChange={(e) => setC("motivo", e.target.value)} disabled={!editable} /></Field>
            ) : null}
          </div>
        </section>

        {/* Totales y adjuntos */}
        <aside className="space-y-4 xl:row-span-3 xl:self-start">
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold text-muted">Totales</h2>
            <dl className="space-y-1 text-sm tnum">
              <div className="flex justify-between"><dt>Base imponible</dt><dd>{eur(totales.neto)}</dd></div>
              {totales.desglose.map((x) => (
                <div key={`${x.operacion}${x.tipo}${x.recargo}`} className="text-muted">
                  <div className="flex justify-between gap-2">
                    <dt>{OPERACIONES[x.operacion].conIva ? `IVA ${num(x.tipo)} %` : OPERACIONES[x.operacion].corto} de {eur(x.base)}</dt><dd>{eur(x.cuota)}</dd>
                  </div>
                  {x.cuotaRecargo ? <div className="flex justify-between gap-2"><dt>R.E. {num(x.recargo)} %</dt><dd>{eur(x.cuotaRecargo)}</dd></div> : null}
                </div>
              ))}
              {totales.desgloseIrpf.map((x) => (
                <div key={`irpf${x.tipo}`} className="flex justify-between text-muted"><dt>IRPF {num(x.tipo)} %</dt><dd>−{eur(x.cuota)}</dd></div>
              ))}
              {totales.totalSuplidos ? <div className="flex justify-between text-muted"><dt>Suplidos</dt><dd>{eur(totales.totalSuplidos)}</dd></div> : null}
            </dl>
            <div className="mt-3 flex items-baseline justify-between bg-brand px-3 py-2 text-brand-on">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-xl font-semibold tnum">{eur(totales.total)}</span>
            </div>
            {totales.leyendas.length ? (
              <ul className="mt-3 space-y-1 text-[11px] leading-4 text-muted">{totales.leyendas.map((t) => <li key={t}>{t}</li>)}</ul>
            ) : null}
            {d && d.estado !== "borrador" ? (
              <dl className="mt-4 space-y-1 border-t border-stroke pt-3 text-xs text-muted">
                {d.emitida_en ? <div><dt className="inline font-semibold">Emitida: </dt><dd className="inline">{new Date(d.emitida_en).toLocaleString("es-ES")}</dd></div> : null}
                {d.pagada_en ? <div><dt className="inline font-semibold">Cobrada: </dt><dd className="inline">{fecha(d.pagada_en)}</dd></div> : null}
                {d.huella ? (
                  <div title="Huella SHA-256 encadenada con la factura anterior. Garantiza que la factura no se ha modificado.">
                    <dt className="flex items-center gap-1 font-semibold"><FileCheck2 size={12} /> Huella de integridad</dt>
                    <dd className="break-all font-mono text-[10px]">{d.huella}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
          {d ? <Adjuntos entidad="documento" id={d.id} /> : null}
          {d ? <CorreosEnviados documentoId={d.id} /> : null}
        </aside>

        {/* Líneas */}
        <section className="card overflow-x-auto xl:col-span-3">
          <table className={`w-full text-sm ${conVehiculos ? "min-w-[1040px]" : "min-w-[900px]"}`}>
            <thead>
              <tr className="text-xs text-muted">
                <th className="min-w-[220px] px-3 py-2 text-left font-semibold">Concepto</th>
                <th className="w-20 px-1 py-2 text-right font-semibold">Cant.</th>
                <th className="w-28 px-1 py-2 text-right font-semibold">Precio</th>
                <th className="w-16 px-1 py-2 text-right font-semibold">Dto. %</th>
                <th className="w-48 px-1 py-2 text-left font-semibold">Impuesto</th>
                {conRecargo ? <th className="w-14 px-1 py-2 text-right font-semibold" title="Recargo de equivalencia">R.E.</th> : null}
                <th className="w-20 px-1 py-2 text-left font-semibold">IRPF</th>
                {conVehiculos ? <th className="w-32 px-1 py-2 text-left font-semibold">Vehículo</th> : null}
                <th className="w-28 px-3 py-2 text-right font-semibold">Importe</th>
                {editable ? <th className="w-10" /> : null}
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={i} className="border-t border-stroke/70 align-top">
                  <td className="px-3 py-2">
                    {editable && productos.data?.length ? (
                      <Select value="" onChange={(e) => elegirProducto(i, e.target.value)} className="mb-1 h-7 text-xs text-muted" aria-label="Producto">
                        <option value="">Desde catálogo…</option>
                        {productos.data.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.referencia ? `${p.referencia} · ` : ""}{p.descripcion}</option>)}
                      </Select>
                    ) : null}
                    <Textarea value={l.descripcion} onChange={(e) => setL(i, { descripcion: e.target.value })} disabled={!editable} rows={1}
                      className="min-h-[32px] resize-y" placeholder="Descripción" aria-label="Descripción" />
                  </td>
                  <td className="px-1 py-2"><Input type="number" step="any" value={l.cantidad} onChange={(e) => setL(i, { cantidad: Number(e.target.value) })} disabled={!editable} className="text-right tnum" aria-label="Cantidad" /></td>
                  <td className="px-1 py-2"><Input type="number" step="any" value={l.precio} onChange={(e) => setL(i, { precio: Number(e.target.value) })} disabled={!editable} className="text-right tnum" aria-label="Precio" /></td>
                  <td className="px-1 py-2"><Input type="number" step="any" min={0} max={100} value={l.dto} onChange={(e) => setL(i, { dto: Number(e.target.value) })} disabled={!editable} className="text-right tnum" aria-label="Descuento" /></td>
                  <td className="px-1 py-2">
                    <Select value={valorImpuesto(l)} onChange={(e) => cambiarImpuesto(i, e.target.value)} disabled={!editable} aria-label="Impuesto" className="min-w-[128px]">
                      <optgroup label="IVA">
                        {[...new Set([...TIPOS_IVA, ...(l.operacion === "S1" && !l.suplido ? [l.iva] : [])])].map((t) => <option key={t} value={`S1:${t}`}>IVA {num(t)} %</option>)}
                      </optgroup>
                      <optgroup label="Sin IVA">
                        {(Object.keys(OPERACIONES) as CodigoOperacion[]).filter((k) => k !== "S1").map((k) => <option key={k} value={k} title={OPERACIONES[k].nombre}>{OPERACIONES[k].corto}</option>)}
                        <option value="SUP" title="Gasto pagado en nombre del cliente: fuera de la base imponible">Suplido</option>
                      </optgroup>
                    </Select>
                  </td>
                  {conRecargo ? <td className="px-1 py-2 pt-3.5 text-right text-xs tnum text-muted">{Number(l.recargo) ? `${num(l.recargo)} %` : "—"}</td> : null}
                  <td className="px-1 py-2">
                    <Select value={l.irpf} onChange={(e) => setL(i, { irpf: Number(e.target.value) })} disabled={!editable || l.suplido} aria-label="IRPF" className="min-w-[76px]">
                      {[...new Set([...TIPOS_IRPF, l.irpf])].map((t) => <option key={t} value={t}>{num(t)} %</option>)}
                    </Select>
                  </td>
                  {conVehiculos ? (
                    <td className="px-1 py-2">
                      <Select value={l.vehiculo_id ?? ""} onChange={(e) => setL(i, { vehiculo_id: e.target.value ? Number(e.target.value) : null })} disabled={!editable} aria-label="Vehículo" className="min-w-[116px]">
                        <option value="">—</option>
                        {vehiculos.data?.filter((v) => v.activo || v.id === l.vehiculo_id).map((v) => <option key={v.id} value={v.id}>{v.matricula}</option>)}
                      </Select>
                    </td>
                  ) : null}
                  <td className="px-3 py-2 pt-3.5 text-right font-semibold tnum">{eur(baseLinea(l))}</td>
                  {editable ? (
                    <td className="py-2 pr-2">
                      <Button size="icon" variant="subtle" onClick={() => { setLineas(lineas.filter((_, j) => j !== i)); setSucio(true); }} aria-label="Quitar línea"><Trash2 size={16} /></Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {editable ? (
            <div className="border-t border-stroke p-2">
              <Button variant="subtle" onClick={() => { setLineas([...lineas, { ...lineaVacia(clienteSel), vehiculo_id: lineas.at(-1)?.vehiculo_id ?? null }]); setSucio(true); }}><Plus size={16} /> Añadir línea</Button>
            </div>
          ) : null}
        </section>

        {d && conRecibos(d.tipo) && d.numero != null && d.recibos.length && ajustes.data?.cobros.panel_en_factura ? (
          <div className="xl:col-span-3"><CobrosPanel doc={d} ajustes={ajustes.data} compra={compra} /></div>
        ) : null}

        <section className="card p-4 xl:col-span-3">
          <Field label="Observaciones (aparecen en el PDF)">
            <Textarea value={cab.observaciones} onChange={(e) => setC("observaciones", e.target.value)} disabled={!editable} rows={2} />
          </Field>
        </section>
      </div>

      {d ? <CorreoDialog doc={d} open={dlgCorreo} onOpenChange={setDlgCorreo} /> : null}
      <FirmaDialog open={dlgFirma} onOpenChange={setDlgFirma} enviando={firmar.isPending} onFirmar={(f) => firmar.mutate(f)} />
      <ClienteDialog tipo={tercero} open={dlgCliente} onOpenChange={setDlgCliente} onGuardado={(c) => { qc.invalidateQueries({ queryKey: [compra ? "proveedores" : "clientes"] }); setCab({ ...cab, cliente_id: c.id, forma_pago: cab.forma_pago || c.forma_pago || "" }); setSucio(true); }} />

      <Dialog open={confirmar === "emitir"} onOpenChange={(v) => !v && setConfirmar(null)} title={`¿Emitir ${["presupuesto", "pedido", "albaran"].includes(tipo) ? "el" : "la"} ${info.singular.toLowerCase()}?`}
        footer={<><Button onClick={() => setConfirmar(null)}>Cancelar</Button><Button variant="primary" disabled={accion.isPending} onClick={() => accion.mutate({ ruta: "emitir" })}>Emitir</Button></>}>
        <p className="text-sm">
          {tipo === "factura"
            ? "Se le asignará el siguiente número de la serie y ya no se podrá modificar ni eliminar. Si después hay que corregirla, tendrás que emitir una factura rectificativa."
            : tipo === "factura_compra" ? "Se registrará con el siguiente número del libro de facturas recibidas y se generarán sus vencimientos de pago."
            : "Se le asignará un número y ya no se podrá modificar."}
        </p>
        <p className="mt-3 text-sm"><span className="text-muted">{compra ? "Proveedor:" : "Cliente:"}</span> {clienteSel?.nombre || "—"} · <span className="text-muted">Total:</span> <strong>{eur(totales.total)}</strong></p>
      </Dialog>

      <Dialog open={confirmar === "rectificar"} onOpenChange={(v) => !v && setConfirmar(null)} title="Crear factura rectificativa"
        description="Se creará un borrador en la serie de rectificativas con todas las líneas en negativo. Podrás ajustarlo antes de emitirlo."
        footer={<><Button onClick={() => setConfirmar(null)}>Cancelar</Button><Button variant="primary" disabled={!motivo.trim() || accion.isPending} onClick={() => accion.mutate({ ruta: "rectificar", cuerpo: { motivo } })}>Crear rectificativa</Button></>}>
        <Field label="Motivo de la rectificación *"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Por ejemplo: error en el precio del porte" /></Field>
      </Dialog>

      <Dialog open={confirmar === "borrar"} onOpenChange={(v) => !v && setConfirmar(null)} title="¿Eliminar el borrador?"
        footer={<><Button onClick={() => setConfirmar(null)}>Cancelar</Button><Button variant="danger" onClick={() => borrar.mutate()}>Eliminar</Button></>}>
        <p className="text-sm">Esta acción no se puede deshacer.</p>
      </Dialog>
    </div>
  );
}
