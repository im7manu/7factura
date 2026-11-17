import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { api, type Producto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Empty, Loading, PageHeader, Table, td, th } from "@/components/ui/misc";
import { cn, eur, num } from "@/lib/utils";

type Datos = Omit<Producto, "id">;
const VACIO: Datos = { referencia: "", descripcion: "", precio: 0, iva: 21, activo: 1 };

export default function Productos() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Producto | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState<Datos>(VACIO);
  const query = useQuery({ queryKey: ["productos"], queryFn: () => api.get<Producto[]>("/productos") });
  useEffect(() => { if (abierto) setD(editando ? { ...editando } : VACIO); }, [abierto, editando]);

  const guardar = useMutation({
    mutationFn: () => (editando ? api.put(`/productos/${editando.id}`, { ...d, activo: !!d.activo }) : api.post("/productos", { ...d, activo: !!d.activo })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["productos"] }); toast.success("Guardado"); setAbierto(false); },
    onError: (e) => toast.error((e as Error).message),
  });
  const borrar = useMutation({
    mutationFn: (id: number) => api.del(`/productos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productos"] }),
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); guardar.mutate(); };

  return (
    <div>
      <PageHeader title="Productos y servicios" subtitle="Conceptos habituales para rellenar las líneas más rápido"
        actions={<Button variant="primary" onClick={() => { setEditando(null); setAbierto(true); }}><Plus size={16} /> Nuevo</Button>} />
      {query.isLoading ? <Loading /> : !query.data?.length ? (
        <div className="card"><Empty icon={<Package size={40} />} title="Catálogo vacío">Por ejemplo: «Porte Madrid - Valencia», «Hora de espera», «Kilómetro adicional».</Empty></div>
      ) : (
        <Table>
          <thead><tr><th className={th}>Referencia</th><th className={th}>Descripción</th><th className={cn(th, "text-right")}>Precio</th><th className={cn(th, "text-right")}>IVA</th><th className={th} /></tr></thead>
          <tbody>
            {query.data.map((p) => (
              <tr key={p.id} className={cn("hover:bg-subtle", !p.activo && "text-muted")}>
                <td className={cn(td, "tnum")}>{p.referencia || "—"}</td>
                <td className={td}>{p.descripcion}{!p.activo ? <span className="ml-2 text-xs">(inactivo)</span> : null}</td>
                <td className={cn(td, "text-right tnum")}>{eur(p.precio)}</td>
                <td className={cn(td, "text-right tnum")}>{num(p.iva)} %</td>
                <td className={cn(td, "whitespace-nowrap text-right")}>
                  <Button size="icon" variant="subtle" aria-label="Editar" onClick={() => { setEditando(p); setAbierto(true); }}><Pencil size={16} /></Button>
                  <Button size="icon" variant="subtle" aria-label="Eliminar" onClick={() => confirm(`¿Eliminar ${p.descripcion}?`) && borrar.mutate(p.id)}><Trash2 size={16} /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Dialog open={abierto} onOpenChange={setAbierto} title={editando ? "Editar producto" : "Nuevo producto"}
        footer={<><Button onClick={() => setAbierto(false)}>Cancelar</Button><Button variant="primary" type="submit" form="form-producto" disabled={guardar.isPending}>Guardar</Button></>}>
        <form id="form-producto" onSubmit={enviar} className="grid gap-3 sm:grid-cols-4">
          <Field label="Referencia" className="sm:col-span-1"><Input value={d.referencia} onChange={(e) => setD({ ...d, referencia: e.target.value })} /></Field>
          <Field label="Descripción *" className="sm:col-span-3"><Input value={d.descripcion} onChange={(e) => setD({ ...d, descripcion: e.target.value })} required autoFocus /></Field>
          <Field label="Precio (sin IVA)" className="sm:col-span-2"><Input type="number" step="any" value={d.precio} onChange={(e) => setD({ ...d, precio: Number(e.target.value) })} className="text-right tnum" /></Field>
          <Field label="IVA" className="sm:col-span-1">
            <Select value={d.iva} onChange={(e) => setD({ ...d, iva: Number(e.target.value) })}>{[21, 10, 4, 0].map((t) => <option key={t} value={t}>{t} %</option>)}</Select>
          </Field>
          <Field label="Estado" className="sm:col-span-1">
            <Select value={d.activo} onChange={(e) => setD({ ...d, activo: Number(e.target.value) })}><option value={1}>Activo</option><option value={0}>Inactivo</option></Select>
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
