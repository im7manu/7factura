import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Truck, UserRound } from "lucide-react";
import { api, type Conductor, type Vehiculo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Empty, Loading, PageHeader, Table, td, th } from "@/components/ui/misc";
import { cn, eur, fecha, hoyIso, nifValido } from "@/lib/utils";

// Mismos tipos y estados que 7DeCA, para poder compartir la lista
const TIPOS = ["Tractora", "Rígido", "Remolque", "Semirremolque", "Furgoneta", "Turismo", "Otro"];
const ESTADOS = ["Disponible", "En ruta", "Taller", "Baja"];

export default function Vehiculos() {
  const [pestana, setPestana] = useState<"vehiculos" | "conductores">("vehiculos");
  return (
    <div>
      <PageHeader title="Vehículos y conductores" subtitle="Los mismos datos que usa 7DeCA, listos para compartirse" />
      <div className="mb-4 flex gap-4 border-b border-stroke" role="tablist">
        {([["vehiculos", "Vehículos"], ["conductores", "Conductores"]] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}
            className={cn("relative px-1 pb-2 text-sm", pestana === k ? "font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full after:bg-brand-fg" : "text-muted hover:text-fg")}>
            {t}
          </button>
        ))}
      </div>
      {pestana === "vehiculos" ? <ListaVehiculos /> : <ListaConductores />}
    </div>
  );
}

function ListaVehiculos() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["vehiculos"], queryFn: () => api.get<Vehiculo[]>("/vehiculos") });
  const [dlg, setDlg] = useState<Vehiculo | "nuevo" | null>(null);
  const [f, setF] = useState({ matricula: "", tipo: "Tractora", modelo: "", estado: "Disponible", itv: "", notas: "", activo: true });
  useEffect(() => {
    if (dlg === "nuevo") setF({ matricula: "", tipo: "Tractora", modelo: "", estado: "Disponible", itv: "", notas: "", activo: true });
    else if (dlg) setF({ ...dlg, activo: !!dlg.activo });
  }, [dlg]);
  const guardar = useMutation({
    mutationFn: () => (dlg === "nuevo" ? api.post("/vehiculos", f) : api.put(`/vehiculos/${(dlg as Vehiculo).id}`, f)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehiculos"] }); setDlg(null); toast.success("Vehículo guardado"); },
    onError: (e) => toast.error((e as Error).message),
  });
  const borrar = useMutation({
    mutationFn: (id: number) => api.del(`/vehiculos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehiculos"] }),
    onError: (e) => toast.error((e as Error).message),
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); guardar.mutate(); };
  const hoy = hoyIso();

  return (
    <>
      <div className="mb-2 flex justify-end"><Button variant="primary" onClick={() => setDlg("nuevo")}><Plus size={16} /> Nuevo vehículo</Button></div>
      {q.isLoading ? <Loading /> : !q.data?.length ? (
        <div className="card"><Empty icon={<Truck size={40} />} title="Aún no hay vehículos">Añádelos para asignarles gastos (gasóleo, ITV, ruedas…) y ver cuánto cuesta cada uno.</Empty></div>
      ) : (
        <Table>
          <thead><tr>
            <th className={th}>Matrícula</th><th className={th}>Tipo</th><th className={cn(th, "hidden md:table-cell")}>Modelo</th>
            <th className={th}>Estado</th><th className={th}>ITV</th><th className={cn(th, "text-right")}>Gasto este año</th><th className={th} />
          </tr></thead>
          <tbody>
            {q.data.map((v) => {
              const itvVencida = v.itv && v.itv < hoy;
              return (
                <tr key={v.id} className={cn("hover:bg-subtle", !v.activo && "text-muted")}>
                  <td className={cn(td, "font-semibold tnum")}>{v.matricula}</td>
                  <td className={td}>{v.tipo}</td>
                  <td className={cn(td, "hidden md:table-cell")}>{v.modelo || "—"}</td>
                  <td className={td}>{v.activo ? v.estado : "Inactivo"}</td>
                  <td className={cn(td, itvVencida && "font-semibold text-danger")}>{v.itv ? fecha(v.itv) : "—"}{itvVencida ? " · caducada" : ""}</td>
                  <td className={cn(td, "text-right tnum")}>{eur(v.gasto_anio)}</td>
                  <td className={cn(td, "whitespace-nowrap text-right")}>
                    <Button size="icon" variant="subtle" aria-label="Editar" onClick={() => setDlg(v)}><Pencil size={16} /></Button>
                    <Button size="icon" variant="subtle" aria-label="Eliminar" onClick={() => confirm(`¿Eliminar ${v.matricula}?`) && borrar.mutate(v.id)}><Trash2 size={16} /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Dialog open={!!dlg} onOpenChange={(v) => !v && setDlg(null)} title={dlg === "nuevo" ? "Nuevo vehículo" : "Editar vehículo"}
        footer={<><Button onClick={() => setDlg(null)}>Cancelar</Button><Button variant="primary" type="submit" form="form-vehiculo" disabled={guardar.isPending}>Guardar</Button></>}>
        <form id="form-vehiculo" onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
          <Field label="Matrícula *"><Input value={f.matricula} onChange={(e) => setF({ ...f, matricula: e.target.value })} required autoFocus className="uppercase" /></Field>
          <Field label="Tipo"><Select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{TIPOS.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Modelo"><Input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} /></Field>
          <Field label="Estado"><Select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>{ESTADOS.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Próxima ITV"><Input type="date" value={f.itv} onChange={(e) => setF({ ...f, itv: e.target.value })} /></Field>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo</label>
          <Field label="Notas" className="sm:col-span-2"><Textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} rows={2} /></Field>
        </form>
      </Dialog>
    </>
  );
}

function ListaConductores() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["conductores"], queryFn: () => api.get<Conductor[]>("/conductores") });
  const [dlg, setDlg] = useState<Conductor | "nuevo" | null>(null);
  const [f, setF] = useState({ nombre: "", dni: "", telefono: "", email: "", activo: true });
  useEffect(() => {
    if (dlg === "nuevo") setF({ nombre: "", dni: "", telefono: "", email: "", activo: true });
    else if (dlg) setF({ ...dlg, activo: !!dlg.activo });
  }, [dlg]);
  const guardar = useMutation({
    mutationFn: () => (dlg === "nuevo" ? api.post("/conductores", f) : api.put(`/conductores/${(dlg as Conductor).id}`, f)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["conductores"] }); setDlg(null); toast.success("Conductor guardado"); },
    onError: (e) => toast.error((e as Error).message),
  });
  const borrar = useMutation({ mutationFn: (id: number) => api.del(`/conductores/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["conductores"] }) });
  const dniMal = f.dni.length >= 9 && !nifValido(f.dni);

  return (
    <>
      <div className="mb-2 flex justify-end"><Button variant="primary" onClick={() => setDlg("nuevo")}><Plus size={16} /> Nuevo conductor</Button></div>
      {q.isLoading ? <Loading /> : !q.data?.length ? (
        <div className="card"><Empty icon={<UserRound size={40} />} title="Aún no hay conductores">Se compartirán con 7DeCA cuando conectes las dos aplicaciones.</Empty></div>
      ) : (
        <Table>
          <thead><tr><th className={th}>Nombre</th><th className={th}>DNI</th><th className={cn(th, "hidden md:table-cell")}>Contacto</th><th className={th}>Estado</th><th className={th} /></tr></thead>
          <tbody>
            {q.data.map((c) => (
              <tr key={c.id} className={cn("hover:bg-subtle", !c.activo && "text-muted")}>
                <td className={cn(td, "font-semibold")}>{c.nombre}</td><td className={cn(td, "tnum")}>{c.dni}</td>
                <td className={cn(td, "hidden text-muted md:table-cell")}>{[c.telefono, c.email].filter(Boolean).join(" · ") || "—"}</td>
                <td className={td}>{c.activo ? "Activo" : "Inactivo"}</td>
                <td className={cn(td, "whitespace-nowrap text-right")}>
                  <Button size="icon" variant="subtle" aria-label="Editar" onClick={() => setDlg(c)}><Pencil size={16} /></Button>
                  <Button size="icon" variant="subtle" aria-label="Eliminar" onClick={() => confirm(`¿Eliminar a ${c.nombre}?`) && borrar.mutate(c.id)}><Trash2 size={16} /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Dialog open={!!dlg} onOpenChange={(v) => !v && setDlg(null)} title={dlg === "nuevo" ? "Nuevo conductor" : "Editar conductor"}
        footer={<><Button onClick={() => setDlg(null)}>Cancelar</Button><Button variant="primary" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre *" className="sm:col-span-2"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus /></Field>
          <Field label="DNI / NIE *" error={dniMal ? "DNI no válido" : null}><Input value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} className="uppercase" /></Field>
          <Field label="Teléfono"><Input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo</label>
        </div>
      </Dialog>
    </>
  );
}
