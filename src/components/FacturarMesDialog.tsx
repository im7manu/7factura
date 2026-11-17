import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type Ajustes } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Loading } from "@/components/ui/misc";
import { eur, fecha } from "@/lib/utils";

interface Grupo { cliente_id: number; cliente_nombre: string; cliente_nif: string; total: number; albaranes: { id: number; codigo: string; fecha: string; total: number }[] }
interface Resultado { id: number; codigo: string | null; estado: string; cliente_nombre: string; total: number; error: string | null }

const iso = (d: Date) => d.toLocaleDateString("sv-SE");
function mesAnterior() {
  const h = new Date();
  // Por defecto el mes en curso; si estamos en los primeros 7 días, el mes anterior
  const base = h.getDate() <= 7 ? new Date(h.getFullYear(), h.getMonth() - 1, 1) : new Date(h.getFullYear(), h.getMonth(), 1);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
}

/** Crea una factura por cliente con todos sus albaranes pendientes del mes. */
export function FacturarMesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ajustes = useQuery({ queryKey: ["ajustes"], queryFn: () => api.get<Ajustes>("/ajustes") });
  const [mes, setMes] = useState(mesAnterior);
  const [y, m] = mes.split("-").map(Number);
  const desde = iso(new Date(y, m - 1, 1));
  const hasta = iso(new Date(y, m, 0));
  const [fechaFactura, setFechaFactura] = useState(hasta);
  const [emitir, setEmitir] = useState(false);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [resultado, setResultado] = useState<Resultado[] | null>(null);

  useEffect(() => { setFechaFactura(hasta); }, [hasta]);
  useEffect(() => { if (open) { setResultado(null); setEmitir(!!ajustes.data?.ventas.facturar_mes_emitir); } }, [open, ajustes.data]);
  const q = useQuery({
    queryKey: ["facturar-periodo", desde, hasta], enabled: open,
    queryFn: () => api.get<Grupo[]>(`/documentos/facturar-periodo?desde=${desde}&hasta=${hasta}`),
  });
  useEffect(() => { if (q.data) setElegidos(new Set(q.data.map((g) => g.cliente_id))); }, [q.data]);
  const totalElegido = useMemo(() => (q.data || []).filter((g) => elegidos.has(g.cliente_id)).reduce((s, g) => s + g.total, 0), [q.data, elegidos]);

  const crear = useMutation({
    mutationFn: () => api.post<Resultado[]>("/documentos/facturar-periodo", { desde, hasta, fecha: fechaFactura, emitir, clientes: [...elegidos] }),
    onSuccess: (r) => {
      setResultado(r);
      qc.invalidateQueries({ queryKey: ["documentos"] });
      qc.invalidateQueries({ queryKey: ["resumen"] });
      const fallos = r.filter((x) => x.error).length;
      toast[fallos ? "warning" : "success"](`${r.length} facturas creadas${fallos ? ` · ${fallos} quedaron en borrador` : ""}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const nombreMes = new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Facturar albaranes del mes" className="max-w-2xl"
      description="Se crea una factura por cliente con todos sus albaranes pendientes del mes."
      footer={resultado ? <Button variant="primary" onClick={() => onOpenChange(false)}>Cerrar</Button> : <>
        <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button variant="primary" disabled={!elegidos.size || crear.isPending} onClick={() => crear.mutate()}>
          {emitir ? "Crear y emitir" : "Crear borradores"} ({elegidos.size})
        </Button>
      </>}>
      {resultado ? (
        <ul className="divide-y divide-stroke/70 text-sm">
          {resultado.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              <button className="min-w-0 flex-1 truncate text-left font-semibold text-brand-fg hover:underline" onClick={() => { onOpenChange(false); navigate(`/facturas/${r.id}`); }}>
                {r.codigo || "Borrador"} · {r.cliente_nombre}
              </button>
              <span className="tnum">{eur(r.total)}</span>
              {r.error ? <span className="text-xs text-warning" title={r.error}>No emitida: {r.error}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Mes"><Input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} /></Field>
            <Field label="Fecha de las facturas"><Input type="date" value={fechaFactura} onChange={(e) => setFechaFactura(e.target.value)} /></Field>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={emitir} onChange={(e) => setEmitir(e.target.checked)} /> Emitirlas directamente</label>
          </div>
          {q.isLoading ? <Loading /> : !q.data?.length ? (
            <p className="rounded bg-subtle px-3 py-6 text-center text-sm text-muted">No hay albaranes pendientes de facturar en {nombreMes}.</p>
          ) : (
            <div className="max-h-[45vh] overflow-y-auto rounded border border-stroke">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface"><tr className="text-xs text-muted">
                  <th className="w-8 px-2 py-2"><input type="checkbox" aria-label="Todos" checked={elegidos.size === q.data.length}
                    onChange={(e) => setElegidos(e.target.checked ? new Set(q.data!.map((g) => g.cliente_id)) : new Set())} /></th>
                  <th className="py-2 text-left font-semibold">Cliente</th><th className="py-2 text-left font-semibold">Albaranes</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr></thead>
                <tbody>
                  {q.data.map((g) => (
                    <tr key={g.cliente_id} className="border-t border-stroke/70 align-top">
                      <td className="px-2 py-2"><input type="checkbox" checked={elegidos.has(g.cliente_id)} aria-label={g.cliente_nombre}
                        onChange={(e) => { const n = new Set(elegidos); if (e.target.checked) n.add(g.cliente_id); else n.delete(g.cliente_id); setElegidos(n); }} /></td>
                      <td className="py-2"><div className="font-semibold">{g.cliente_nombre}</div><div className="text-xs text-muted">{g.cliente_nif || "Sin NIF"}</div></td>
                      <td className="py-2 text-xs text-muted">{g.albaranes.map((a) => `${a.codigo} (${fecha(a.fecha)})`).join(" · ")}</td>
                      <td className="px-3 py-2 text-right font-semibold tnum">{eur(g.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {q.data?.length ? <p className="text-right text-sm">Total seleccionado: <strong className="tnum">{eur(totalElegido)}</strong></p> : null}
        </div>
      )}
    </Dialog>
  );
}
