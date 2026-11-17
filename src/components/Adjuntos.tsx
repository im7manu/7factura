import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Eye, FileUp, Paperclip, Trash2 } from "lucide-react";
import { api, type Adjunto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";

const tamano = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const VISIBLE = /^(application\/pdf|image\/(png|jpeg|webp|gif))$/;

/** Lista y subida de archivos adjuntos (albaranes firmados, justificantes…). */
export function Adjuntos({ entidad, id }: { entidad: "documento" | "cliente" | "proveedor"; id: number }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const clave = ["adjuntos", entidad, id];
  const q = useQuery({ queryKey: clave, queryFn: () => api.get<Adjunto[]>(`/adjuntos?entidad=${entidad}&id=${id}`) });

  async function subir(archivos: FileList | null) {
    if (!archivos?.length) return;
    setSubiendo(true);
    try {
      for (const f of Array.from(archivos)) {
        if (f.size > 15 * 1024 * 1024) { toast.error(`${f.name}: supera 15 MB`); continue; }
        const r = await fetch(`/api/adjuntos?entidad=${entidad}&id=${id}`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": f.type || "application/octet-stream", "X-Nombre-Archivo": encodeURIComponent(f.name) },
          body: f,
        });
        if (!r.ok) toast.error(`${f.name}: ${(await r.json().catch(() => ({}))).error || "no se pudo subir"}`);
      }
      qc.invalidateQueries({ queryKey: clave });
      qc.invalidateQueries({ queryKey: ["documento"] });
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  }

  async function borrar(a: Adjunto) {
    if (!confirm(`¿Eliminar «${a.nombre}»?`)) return;
    try {
      await api.del(`/adjuntos/${a.id}`);
      qc.invalidateQueries({ queryKey: clave });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <section
      className="card p-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); subir(e.dataTransfer.files); }}
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Paperclip size={16} /> Adjuntos</h2>
        <Button size="sm" onClick={() => input.current?.click()} disabled={subiendo}>
          {subiendo ? <Spinner className="h-4 w-4" /> : <FileUp size={14} />} Añadir
        </Button>
        <input ref={input} type="file" multiple hidden onChange={(e) => subir(e.target.files)}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.txt,.csv,.xml,.zip,.doc,.docx,.xls,.xlsx,.odt,.ods" />
      </div>
      {!q.data?.length ? (
        <p className="rounded border border-dashed border-stroke px-3 py-4 text-center text-xs text-muted">
          Arrastra aquí archivos (albaranes firmados, justificantes…) o pulsa Añadir. Máximo 15 MB.
        </p>
      ) : (
        <ul className="divide-y divide-stroke/70">
          {q.data.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate" title={a.nombre}>{a.nombre}</span>
              <span className="shrink-0 text-xs text-muted">{tamano(a.tamano)}</span>
              {VISIBLE.test(a.mime) ? (
                <a className="rounded p-1 text-muted hover:bg-subtle" href={`/api/adjuntos/${a.id}/descargar?ver=1`} target="_blank" rel="noreferrer" aria-label="Ver"><Eye size={15} /></a>
              ) : null}
              <a className="rounded p-1 text-muted hover:bg-subtle" href={`/api/adjuntos/${a.id}/descargar`} aria-label="Descargar"><Download size={15} /></a>
              <button className="rounded p-1 text-muted hover:bg-subtle" onClick={() => borrar(a)} aria-label="Eliminar"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
