import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type Ajustes, type Cliente } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { nifValido, OPERACIONES } from "@/lib/utils";
import type { CodigoOperacion } from "@/lib/api";
import { PlazosEditor } from "@/components/PlazosEditor";

type Datos = Omit<Cliente, "id" | "num_facturas" | "pendiente">;
const VACIO: Datos = { nombre: "", nif: "", direccion: "", cp: "", ciudad: "", provincia: "", pais: "ES", email: "", telefono: "", forma_pago: null, notas: "", operacion: "S1", recargo: 0, plazos: null, dias_pago: "" };

export function ClienteDialog({ open, onOpenChange, cliente, onGuardado, tipo = "cliente" }: {
  open: boolean; onOpenChange: (v: boolean) => void; cliente?: Cliente | null; onGuardado?: (c: Cliente) => void;
  tipo?: "cliente" | "proveedor";
}) {
  const ruta = tipo === "proveedor" ? "/proveedores" : "/clientes";
  const etiqueta = tipo === "proveedor" ? "proveedor" : "cliente";
  const qc = useQueryClient();
  const [d, setD] = useState<Datos>(VACIO);
  const ajustes = useQuery({ queryKey: ["ajustes"], queryFn: () => api.get<Ajustes>("/ajustes") });
  useEffect(() => { if (open) setD(cliente ? { ...VACIO, ...cliente } : VACIO); }, [open, cliente]);

  const guardar = useMutation({
    mutationFn: () => (cliente ? api.put<Cliente>(`${ruta}/${cliente.id}`, d) : api.post<Cliente>(ruta, d)),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: [tipo === "proveedor" ? "proveedores" : "clientes"] });
      toast.success(cliente ? `${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} actualizado` : `${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} creado`);
      onGuardado?.(c);
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const set = (k: keyof Datos) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const nifMal = d.pais === "ES" && d.nif.length >= 9 && !nifValido(d.nif);
  const enviar = (e: FormEvent) => { e.preventDefault(); guardar.mutate(); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={cliente ? `Editar ${etiqueta}` : `Nuevo ${etiqueta}`} className="max-w-2xl"
      footer={<>
        <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button variant="primary" type="submit" form="form-cliente" disabled={guardar.isPending}>Guardar</Button>
      </>}>
      <form id="form-cliente" onSubmit={enviar} className="grid gap-3 sm:grid-cols-6">
        <Field label="Nombre o razón social *" className="sm:col-span-4"><Input value={d.nombre} onChange={set("nombre")} required autoFocus /></Field>
        <Field label="NIF" className="sm:col-span-2" error={nifMal ? "NIF no válido" : null}><Input value={d.nif} onChange={set("nif")} className="uppercase" /></Field>
        <Field label="Dirección" className="sm:col-span-6"><Input value={d.direccion} onChange={set("direccion")} /></Field>
        <Field label="C.P." className="sm:col-span-1"><Input value={d.cp} onChange={set("cp")} /></Field>
        <Field label="Ciudad" className="sm:col-span-2"><Input value={d.ciudad} onChange={set("ciudad")} /></Field>
        <Field label="Provincia" className="sm:col-span-2"><Input value={d.provincia} onChange={set("provincia")} /></Field>
        <Field label="País" className="sm:col-span-1"><Input value={d.pais} onChange={set("pais")} maxLength={2} className="uppercase" /></Field>
        <Field label="Email" className="sm:col-span-3"><Input type="email" value={d.email} onChange={set("email")} /></Field>
        <Field label="Teléfono" className="sm:col-span-3"><Input type="tel" value={d.telefono} onChange={set("telefono")} /></Field>
        <Field label="Forma de pago habitual" className="sm:col-span-3">
          <Select value={d.forma_pago || ""} onChange={(e) => setD({ ...d, forma_pago: e.target.value || null })}>
            <option value="">—</option>
            {ajustes.data?.formas_pago.map((f) => <option key={f.codigo} value={f.codigo}>{f.descripcion}</option>)}
          </Select>
        </Field>
        <Field label="IVA habitual" hint="Se aplica a las líneas nuevas (p. ej. exportación o intracomunitaria)" className="sm:col-span-3">
          <Select value={d.operacion} onChange={(e) => setD({ ...d, operacion: e.target.value as CodigoOperacion })}>
            {(Object.keys(OPERACIONES) as CodigoOperacion[]).map((k) => <option key={k} value={k}>{OPERACIONES[k].nombre}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-6">
          <input type="checkbox" checked={!!d.recargo} onChange={(e) => setD({ ...d, recargo: e.target.checked ? 1 : 0 })} />
          Recargo de equivalencia (comerciante minorista)
        </label>
        <details className="rounded border border-stroke px-3 py-2 sm:col-span-6" open={!!(d.plazos?.length || d.dias_pago)}>
          <summary className="cursor-pointer text-sm font-semibold">Condiciones de pago propias</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <span className="field-label">Plazos</span>
              <p className="mb-2 text-xs text-muted">Si los dejas vacíos se usan los de la forma de pago.</p>
              <PlazosEditor valor={d.plazos || []} onChange={(p) => setD({ ...d, plazos: p.length ? p : null })} />
            </div>
            <Field label="Días de pago fijos" hint="Días del mes en que paga, separados por comas. Ej.: 10, 25">
              <Input value={d.dias_pago} onChange={set("dias_pago")} placeholder="10, 25" />
            </Field>
          </div>
        </details>
        <Field label="Notas" className="sm:col-span-6"><Textarea value={d.notas} onChange={set("notas")} rows={2} /></Field>
      </form>
    </Dialog>
  );
}
