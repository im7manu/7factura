import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Plus, Trash2, Wallet, X } from "lucide-react";
import { api, type Ajustes, type Documento, type Recibo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { cn, eur, fecha, hoyIso } from "@/lib/utils";

function estadoRecibo(r: Recibo) {
  if (Math.abs(r.pendiente) < 0.005) return { t: "Liquidado", c: "bg-success/15 text-success" };
  if (r.vencimiento < hoyIso()) return { t: "Vencido", c: "bg-warning/15 text-warning" };
  if (Math.abs(r.cobrado) >= 0.005) return { t: "Parcial", c: "bg-brand-soft text-brand-fg" };
  return { t: "Pendiente", c: "bg-subtle text-muted" };
}

/** Vencimientos y cobros de una factura emitida. */
export function CobrosPanel({ doc, ajustes, compra = false }: { doc: Documento; ajustes: Ajustes; compra?: boolean }) {
  const qc = useQueryClient();
  const [cobrando, setCobrando] = useState<Recibo | null>(null);
  const [form, setForm] = useState({ fecha: hoyIso(), importe: 0, forma_pago: "", notas: "" });
  const [editando, setEditando] = useState(false);
  const [filas, setFilas] = useState<{ importe: number; vencimiento: string }[]>([]);
  const parciales = ajustes.cobros.cobros_parciales;

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["documento", String(doc.id)] });
    qc.invalidateQueries({ queryKey: ["documentos"] });
    qc.invalidateQueries({ queryKey: ["recibos"] });
    qc.invalidateQueries({ queryKey: ["avisos"] });
    qc.invalidateQueries({ queryKey: ["resumen"] });
  };
  const fallo = (e: unknown) => toast.error((e as Error).message);

  const cobrar = useMutation({
    mutationFn: () => api.post(`/cobros/recibos/${cobrando!.id}/cobros`, form),
    onSuccess: () => { refrescar(); setCobrando(null); toast.success(compra ? "Pago registrado" : "Cobro registrado"); },
    onError: fallo,
  });
  const anular = useMutation({
    mutationFn: (id: number) => api.del(`/cobros/cobros/${id}`),
    onSuccess: () => { refrescar(); toast.success("Cobro anulado"); },
    onError: fallo,
  });
  const guardarVenc = useMutation({
    mutationFn: () => api.put(`/cobros/documentos/${doc.id}/recibos`, { recibos: filas }),
    onSuccess: () => { refrescar(); setEditando(false); toast.success("Vencimientos guardados"); },
    onError: fallo,
  });

  const abrirCobro = (r: Recibo) => {
    setForm({ fecha: hoyIso(), importe: r.pendiente, forma_pago: r.forma_pago || "", notas: "" });
    setCobrando(r);
  };
  const editables = doc.recibos.filter((r) => !r.cobros.length);
  const fijos = doc.recibos.filter((r) => r.cobros.length);
  const objetivo = Math.round((doc.total - fijos.reduce((s, r) => s + r.importe, 0)) * 100) / 100;
  const sumaFilas = Math.round(filas.reduce((s, f) => s + (Number(f.importe) || 0), 0) * 100) / 100;

  return (
    <section className="card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Wallet size={16} /> {compra ? "Vencimientos y pagos" : "Vencimientos y cobros"}</h2>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{compra ? "Pagado" : "Cobrado"} <strong className="text-fg tnum">{eur(doc.cobrado)}</strong> de {eur(doc.total)}</span>
          <Button size="sm" variant="subtle" onClick={() => { setFilas(editables.map((r) => ({ importe: r.importe, vencimiento: r.vencimiento }))); setEditando(true); }}>
            <CalendarClock size={14} /> Editar vencimientos
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr className="text-xs text-muted">
            <th className="py-1 text-left font-semibold">Nº</th><th className="py-1 text-left font-semibold">Vencimiento</th>
            <th className="py-1 text-right font-semibold">Importe</th><th className="py-1 text-right font-semibold">Pendiente</th>
            <th className="py-1 pl-3 text-left font-semibold">Estado</th><th />
          </tr></thead>
          <tbody>
            {doc.recibos.map((r) => {
              const e = estadoRecibo(r);
              return [
                <tr key={r.id} className="border-t border-stroke/70">
                  <td className="py-1.5">{r.numero}</td>
                  <td className="py-1.5">{fecha(r.vencimiento)}</td>
                  <td className="py-1.5 text-right tnum">{eur(r.importe)}</td>
                  <td className="py-1.5 text-right font-semibold tnum">{eur(r.pendiente)}</td>
                  <td className="py-1.5 pl-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", e.c)}>{e.t}</span></td>
                  <td className="py-1.5 text-right">
                    {Math.abs(r.pendiente) >= 0.005 ? <Button size="sm" onClick={() => abrirCobro(r)}><Plus size={14} /> {r.importe < 0 ? "Devolver" : compra ? "Pagar" : "Cobrar"}</Button> : null}
                  </td>
                </tr>,
                ...r.cobros.map((c) => (
                  <tr key={`c${c.id}`} className="text-xs text-muted">
                    <td />
                    <td colSpan={2} className="pb-1">↳ {r.importe < 0 ? "Devuelto" : compra ? "Pagado" : "Cobrado"} el {fecha(c.fecha)}{c.forma_pago ? ` · ${ajustes.formas_pago.find((f) => f.codigo === c.forma_pago)?.descripcion || c.forma_pago}` : ""}{c.notas ? ` · ${c.notas}` : ""}</td>
                    <td className="pb-1 text-right tnum">{eur(c.importe)}</td>
                    <td colSpan={2} className="pb-1 text-right">
                      <button className="rounded p-0.5 hover:bg-subtle" title="Anular cobro" aria-label="Anular cobro"
                        onClick={() => confirm("¿Anular este cobro?") && anular.mutate(c.id)}><X size={13} /></button>
                    </td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!cobrando} onOpenChange={(v) => !v && setCobrando(null)} title={cobrando && cobrando.importe < 0 ? "Registrar devolución" : compra ? "Registrar pago" : "Registrar cobro"}
        description={cobrando ? `Recibo ${cobrando.numero} · vence el ${fecha(cobrando.vencimiento)} · pendiente ${eur(cobrando.pendiente)}` : undefined}
        footer={<><Button onClick={() => setCobrando(null)}>Cancelar</Button><Button variant="primary" disabled={cobrar.isPending} onClick={() => cobrar.mutate()}>Guardar</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha"><Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></Field>
          <Field label="Importe" hint={parciales ? "Puedes cobrar solo una parte" : "Cobros parciales desactivados en Ajustes"}>
            <Input type="number" step="any" value={form.importe} disabled={!parciales} onChange={(e) => setForm({ ...form, importe: Number(e.target.value) })} className="text-right tnum" />
          </Field>
          <Field label="Forma de pago">
            <Select value={form.forma_pago} onChange={(e) => setForm({ ...form, forma_pago: e.target.value })}>
              <option value="">—</option>
              {ajustes.formas_pago.map((f) => <option key={f.codigo} value={f.codigo}>{f.descripcion}</option>)}
            </Select>
          </Field>
          <Field label="Nota"><Input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Opcional" /></Field>
        </div>
      </Dialog>

      <Dialog open={editando} onOpenChange={setEditando} title="Editar vencimientos" className="max-w-xl"
        description={fijos.length ? "Los recibos que ya tienen cobros no se pueden cambiar." : "Reparte el total de la factura en los vencimientos que necesites."}
        footer={<><Button onClick={() => setEditando(false)}>Cancelar</Button><Button variant="primary" disabled={guardarVenc.isPending || Math.abs(sumaFilas - objetivo) > 0.005} onClick={() => guardarVenc.mutate()}>Guardar</Button></>}>
        <div className="space-y-2">
          {filas.map((f, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label={i ? "" : "Vencimiento"}><Input type="date" value={f.vencimiento} onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, vencimiento: e.target.value } : x)))} /></Field>
              <Field label={i ? "" : "Importe"}><Input type="number" step="any" value={f.importe} onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, importe: Number(e.target.value) } : x)))} className="w-32 text-right tnum" /></Field>
              <Button size="icon" variant="subtle" onClick={() => setFilas(filas.filter((_, j) => j !== i))} aria-label="Quitar vencimiento"><Trash2 size={16} /></Button>
            </div>
          ))}
          <Button size="sm" onClick={() => setFilas([...filas, { importe: Math.round((objetivo - sumaFilas) * 100) / 100, vencimiento: filas.at(-1)?.vencimiento || hoyIso() }])}><Plus size={14} /> Añadir vencimiento</Button>
          <p className={cn("text-sm", Math.abs(sumaFilas - objetivo) > 0.005 ? "text-danger" : "text-muted")}>
            Suma {eur(sumaFilas)} de {eur(objetivo)}{Math.abs(sumaFilas - objetivo) > 0.005 ? ` · faltan ${eur(objetivo - sumaFilas)}` : ""}
          </p>
        </div>
      </Dialog>
    </section>
  );
}
