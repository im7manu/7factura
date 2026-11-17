import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, FileText, Plus, Receipt, Search } from "lucide-react";
import { FacturarMesDialog } from "@/components/FacturarMesDialog";
import { api, type DocumentoResumen, type TipoDoc } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { CommandBar, Empty, EstadoBadge, Loading, PageHeader, Table, td, th } from "@/components/ui/misc";
import { cn, conRecibos, esCompra, eur, fecha, hoyIso, TIPOS_DOC } from "@/lib/utils";

const ESTADOS: Record<TipoDoc, { v: string; t: string }[]> = {
  factura: [{ v: "borrador", t: "Borradores" }, { v: "emitida", t: "Pendientes de cobro" }, { v: "pagada", t: "Pagadas" }],
  presupuesto: [{ v: "borrador", t: "Borradores" }, { v: "emitido", t: "Emitidos" }, { v: "aceptado", t: "Aceptados" }, { v: "rechazado", t: "Rechazados" }, { v: "facturado", t: "Facturados" }],
  proforma: [{ v: "borrador", t: "Borradores" }, { v: "emitida", t: "Emitidas" }, { v: "facturada", t: "Facturadas" }, { v: "anulada", t: "Anuladas" }],
  pedido: [{ v: "borrador", t: "Borradores" }, { v: "emitido", t: "Pendientes de servir" }, { v: "servido", t: "Servidos" }, { v: "facturado", t: "Facturados" }, { v: "cancelado", t: "Cancelados" }],
  albaran: [{ v: "borrador", t: "Borradores" }, { v: "emitido", t: "Sin firmar" }, { v: "firmado", t: "Firmados" }, { v: "facturado", t: "Facturados" }],
  presupuesto_compra: [{ v: "borrador", t: "Borradores" }, { v: "emitido", t: "Pendientes" }, { v: "aceptado", t: "Aceptados" }, { v: "rechazado", t: "Rechazados" }, { v: "facturado", t: "Facturados" }],
  pedido_compra: [{ v: "borrador", t: "Borradores" }, { v: "emitido", t: "Pendientes de recibir" }, { v: "recibido", t: "Recibidos" }, { v: "facturado", t: "Facturados" }, { v: "cancelado", t: "Cancelados" }],
  albaran_compra: [{ v: "borrador", t: "Borradores" }, { v: "emitido", t: "Pendientes de facturar" }, { v: "facturado", t: "Facturados" }],
  factura_compra: [{ v: "borrador", t: "Borradores" }, { v: "emitida", t: "Pendientes de pago" }, { v: "pagada", t: "Pagadas" }],
  gasto: [{ v: "borrador", t: "Borradores" }, { v: "emitida", t: "Pendientes de pago" }, { v: "pagada", t: "Pagados" }],
};

export default function Documentos({ tipo }: { tipo: TipoDoc }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") || "");
  const anioActual = new Date().getFullYear();
  const estado = params.get("estado") || (params.get("pendientes") ? "emitida" : "");
  const ejercicio = params.get("ejercicio") || "";
  const info = TIPOS_DOC[tipo];
  const base = info.ruta;
  const qc = useQueryClient();
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [dlgMes, setDlgMes] = useState(false);
  const esAlbaran = tipo === "albaran" || tipo === "albaran_compra";
  const compra = esCompra(tipo);
  const agrupar = useMutation({
    mutationFn: () => api.post<{ id: number }>("/documentos/agrupar", { ids: [...seleccion] }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["documentos"] }); setSeleccion(new Set()); toast.success("Factura creada como borrador"); navigate(`/facturas/${d.id}`); },
    onError: (e) => toast.error((e as Error).message),
  });

  const query = useQuery({
    queryKey: ["documentos", tipo, estado, ejercicio, q],
    queryFn: () => {
      const sp = new URLSearchParams({ tipo });
      if (estado) sp.set("estado", estado);
      if (ejercicio) sp.set("ejercicio", ejercicio);
      if (q) sp.set("q", q);
      return api.get<DocumentoResumen[]>(`/documentos?${sp}`);
    },
  });

  const setFiltro = (k: string, v: string) => {
    const sp = new URLSearchParams(params);
    sp.delete("pendientes");
    if (v) sp.set(k, v); else sp.delete(k);
    setParams(sp, { replace: true });
  };

  const filas = query.data || [];
  const hoy = hoyIso();
  const suma = filas.filter((f) => f.estado !== "borrador").reduce((s, f) => ({ neto: s.neto + f.neto, total: s.total + f.total }), { neto: 0, total: 0 });

  return (
    <div>
      <PageHeader
        title={info.plural}
        subtitle={filas.length ? `${filas.length} documentos · base ${eur(suma.neto)} · total ${eur(suma.total)}` : undefined}
        actions={<>
          {tipo === "albaran" ? <Button onClick={() => setDlgMes(true)}><CalendarRange size={16} /> Facturar el mes</Button> : null}
          <Button variant="primary" onClick={() => navigate(info.nueva)}><Plus size={16} /> {info.nuevo}</Button>
        </>}
      />
      <CommandBar>
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-2.5 top-2 text-muted" />
          <Input placeholder="Buscar por número, cliente, NIF o referencia" value={q} onChange={(e) => setQ(e.target.value)} className="border-transparent pl-8" />
        </div>
        <Select value={estado} onChange={(e) => setFiltro("estado", e.target.value)} className="w-auto border-transparent" aria-label="Estado">
          <option value="">Todos los estados</option>
          {ESTADOS[tipo].map((e) => <option key={e.v} value={e.v}>{e.t}</option>)}
        </Select>
        <Select value={ejercicio} onChange={(e) => setFiltro("ejercicio", e.target.value)} className="w-auto border-transparent" aria-label="Ejercicio">
          <option value="">Todos los años</option>
          {[0, 1, 2, 3, 4].map((i) => <option key={i} value={anioActual - i}>{anioActual - i}</option>)}
        </Select>
      </CommandBar>

      {esAlbaran && seleccion.size ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded bg-brand-soft px-3 py-2 text-sm">
          <span><strong>{seleccion.size}</strong> albaranes seleccionados</span>
          <Button size="sm" variant="primary" disabled={agrupar.isPending} onClick={() => agrupar.mutate()}><Receipt size={14} /> Facturar juntos</Button>
          <Button size="sm" variant="subtle" onClick={() => setSeleccion(new Set())}>Quitar selección</Button>
        </div>
      ) : null}
      {query.isLoading ? <Loading /> : filas.length === 0 ? (
        <div className="card">
          <Empty icon={<FileText size={40} />} title={q || estado || ejercicio ? "No hay resultados" : `Aún no hay ${info.plural.toLowerCase()}`}>
            {q || estado || ejercicio ? "Prueba con otros filtros." : "Crea el primero con el botón de arriba."}
          </Empty>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              {esAlbaran ? <th className={cn(th, "w-8")} /> : null}
              <th className={th}>Número</th><th className={th}>Fecha</th><th className={th}>{compra ? "Proveedor" : "Cliente"}</th>
              <th className={cn(th, "hidden md:table-cell")}>{conRecibos(tipo) ? "Vencimiento" : tipo === "albaran" ? "Recibido por" : compra ? "Nº del proveedor" : "Válido hasta"}</th>
              <th className={th}>Estado</th>
              <th className={cn(th, "hidden text-right sm:table-cell")}>Base</th><th className={cn(th, "text-right")}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="cursor-pointer hover:bg-subtle" onClick={() => navigate(`${base}/${f.id}`)}>
                {esAlbaran ? (
                  <td className={td} onClick={(e) => e.stopPropagation()}>
                    {["emitido", "firmado"].includes(f.estado) ? (
                      <input type="checkbox" aria-label={`Seleccionar ${f.codigo}`} checked={seleccion.has(f.id)}
                        onChange={(e) => { const n = new Set(seleccion); if (e.target.checked) n.add(f.id); else n.delete(f.id); setSeleccion(n); }} />
                    ) : null}
                  </td>
                ) : null}
                <td className={cn(td, "font-semibold whitespace-nowrap")}>
                  {f.codigo || <span className="italic text-muted">Borrador</span>}
                  {f.rectifica_id ? <span className="ml-1.5 rounded bg-subtle px-1 text-[11px] text-muted">R</span> : null}
                </td>
                <td className={cn(td, "whitespace-nowrap")}>{fecha(f.fecha)}</td>
                <td className={cn(td, "max-w-[260px]")}>
                  <div className="truncate">{f.cliente_nombre || "—"}</div>
                  <div className="text-xs text-muted">{[f.cliente_nif, f.numero_proveedor && `Nº ${f.numero_proveedor}`, f.referencia && `Ref. ${f.referencia}`].filter(Boolean).join(" · ")}</div>
                </td>
                <td className={cn(td, "hidden whitespace-nowrap md:table-cell")}>{conRecibos(tipo) ? fecha(f.vencimiento) : tipo === "albaran" ? (f.firma_nombre || "—") : compra ? (f.numero_proveedor || "—") : fecha(f.vencimiento)}</td>
                <td className={td}>
                  <EstadoBadge estado={f.estado} compra={compra} vencida={conRecibos(tipo) && !!f.vencimiento && f.vencimiento < hoy} />
                  {f.estado === "emitida" && f.cobrado ? <span className="ml-1 text-[11px] text-muted">{compra ? "pagado" : "cobrado"} {eur(f.cobrado)}</span> : null}
                </td>
                <td className={cn(td, "hidden text-right tnum sm:table-cell")}>{eur(f.neto)}</td>
                <td className={cn(td, "text-right font-semibold tnum")}>{eur(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {tipo === "albaran" ? <FacturarMesDialog open={dlgMes} onOpenChange={setDlgMes} /> : null}
    </div>
  );
}
