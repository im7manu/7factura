import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Search, Wallet } from "lucide-react";
import { api, type Ajustes } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { CommandBar, Empty, Loading, PageHeader, Table, td, th } from "@/components/ui/misc";
import { cn, eur, fecha, hoyIso, TIPOS_DOC } from "@/lib/utils";

interface FilaRecibo {
  id: number; numero: number; num_recibos: number; importe: number; tipo: string; numero_proveedor: string | null; vencimiento: string; forma_pago: string | null; documento_id: number;
  codigo: string; fecha: string; cliente_nombre: string; cliente_nif: string; pendiente: number; ultimo_cobro: string | null; vencido: boolean;
}

/** Listado de recibos pendientes, vencidos y cobrados, con cobro rápido. */
export default function Cobros({ ambito = "ventas" }: { ambito?: "ventas" | "compras" }) {
  const compras = ambito === "compras";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [estado, setEstado] = useState("pendientes");
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const ajustes = useQuery({ queryKey: ["ajustes"], queryFn: () => api.get<Ajustes>("/ajustes") });
  const recibos = useQuery({
    queryKey: ["recibos", ambito, estado, q, desde, hasta],
    queryFn: () => api.get<FilaRecibo[]>(`/cobros/recibos?${new URLSearchParams({ ambito, estado, q, desde, hasta })}`),
  });
  const cobrar = useMutation({
    mutationFn: (r: FilaRecibo) => api.post(`/cobros/recibos/${r.id}/cobros`, { importe: r.pendiente, fecha: hoyIso() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recibos"] });
      qc.invalidateQueries({ queryKey: ["avisos"] });
      qc.invalidateQueries({ queryKey: ["resumen"] });
      toast.success(compras ? "Pago registrado con fecha de hoy" : "Cobro registrado con fecha de hoy");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const filas = recibos.data || [];
  const total = filas.reduce((s, f) => s + (estado === "cobrados" ? f.importe : f.pendiente), 0);
  const fp = (c: string | null) => ajustes.data?.formas_pago.find((f) => f.codigo === c)?.descripcion || c || "—";

  return (
    <div>
      <PageHeader title={compras ? "Pagos" : "Cobros"} subtitle={filas.length ? `${filas.length} ${compras ? "pagos" : "recibos"} · ${eur(total)} ${estado === "cobrados" ? (compras ? "pagados" : "cobrados") : "pendientes"}` : undefined} />
      <CommandBar>
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-2.5 top-2 text-muted" />
          <Input placeholder={compras ? "Buscar por factura, proveedor o NIF" : "Buscar por factura, cliente o NIF"} value={q} onChange={(e) => setQ(e.target.value)} className="border-transparent pl-8" />
        </div>
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-auto border-transparent" aria-label="Estado">
          <option value="pendientes">Pendientes</option>
          <option value="vencidos">Vencidos</option>
          <option value="cobrados">{compras ? "Pagados" : "Cobrados"}</option>
          <option value="todos">Todos</option>
        </Select>
        <label className="flex items-center gap-1 text-xs text-muted">Vence desde <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-8 w-36 border-transparent" /></label>
        <label className="flex items-center gap-1 text-xs text-muted">hasta <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-8 w-36 border-transparent" /></label>
      </CommandBar>
      {recibos.isLoading ? <Loading /> : !filas.length ? (
        <div className="card"><Empty icon={<Wallet size={40} />} title={estado === "vencidos" ? (compras ? "No hay pagos vencidos" : "No hay recibos vencidos") : (compras ? "No hay pagos" : "No hay recibos")}>{estado === "pendientes" ? (compras ? "Todo pagado." : "Todo cobrado.") : "Prueba con otros filtros."}</Empty></div>
      ) : (
        <Table>
          <thead><tr>
            <th className={th}>Vencimiento</th><th className={th}>{compras ? "Documento" : "Factura"}</th><th className={th}>{compras ? "Proveedor" : "Cliente"}</th>
            <th className={cn(th, "hidden md:table-cell")}>Forma de pago</th>
            <th className={cn(th, "text-right")}>Importe</th><th className={cn(th, "text-right")}>{estado === "cobrados" ? (compras ? "Pagado el" : "Cobrado el") : "Pendiente"}</th><th className={th} />
          </tr></thead>
          <tbody>
            {filas.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-subtle" onClick={() => navigate(`${TIPOS_DOC[r.tipo as keyof typeof TIPOS_DOC]?.ruta || "/facturas"}/${r.documento_id}`)}>
                <td className={cn(td, "whitespace-nowrap", r.vencido && "font-semibold text-warning")}>{fecha(r.vencimiento)}{r.vencido ? " · vencido" : ""}</td>
                <td className={cn(td, "whitespace-nowrap font-semibold")}>{r.codigo}{r.numero_proveedor ? <span className="ml-1 text-xs font-normal text-muted">({r.numero_proveedor})</span> : null}{r.num_recibos > 1 ? <span className="ml-1 text-xs font-normal text-muted">({r.numero}/{r.num_recibos})</span> : null}</td>
                <td className={cn(td, "max-w-[240px]")}><div className="truncate">{r.cliente_nombre}</div><div className="text-xs text-muted">{r.cliente_nif}</div></td>
                <td className={cn(td, "hidden md:table-cell")}>{fp(r.forma_pago)}</td>
                <td className={cn(td, "text-right tnum")}>{eur(r.importe)}</td>
                <td className={cn(td, "text-right font-semibold tnum")}>{estado === "cobrados" || Math.abs(r.pendiente) < 0.005 ? fecha(r.ultimo_cobro) : eur(r.pendiente)}</td>
                <td className={cn(td, "text-right")} onClick={(e) => e.stopPropagation()}>
                  {Math.abs(r.pendiente) >= 0.005 ? (
                    <Button size="sm" title="Cobrar todo lo pendiente con fecha de hoy" onClick={() => cobrar.mutate(r)} disabled={cobrar.isPending}><CheckCircle2 size={14} /> {compras ? "Pagar" : "Cobrar"}</Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
