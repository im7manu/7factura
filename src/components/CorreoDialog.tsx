import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Paperclip, Send } from "lucide-react";
import { api, type BorradorCorreo, type Documento } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Loading } from "@/components/ui/misc";

const PROVEEDOR: Record<string, string> = { google: "Gmail", microsoft: "Outlook / Microsoft 365", smtp: "SMTP" };

/** Ventana de correo para enviar un documento desde la cuenta del usuario. */
export function CorreoDialog({ doc, open, onOpenChange }: { doc: Documento; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["correo-borrador", doc.id], queryFn: () => api.get<BorradorCorreo>(`/correo/documentos/${doc.id}/borrador`), enabled: open, staleTime: 0, gcTime: 0 });
  const [f, setF] = useState({ para: "", cc: "", cco: "", asunto: "", cuerpo: "" });
  const [adjuntos, setAdjuntos] = useState<Set<string>>(new Set());
  const [verCopias, setVerCopias] = useState(false);
  useEffect(() => {
    if (q.data) {
      setF({ para: q.data.para, cc: q.data.cc, cco: q.data.cco, asunto: q.data.asunto, cuerpo: q.data.cuerpo });
      setAdjuntos(new Set(q.data.adjuntos.filter((a) => a.marcado).map((a) => a.id)));
      setVerCopias(false);
    }
  }, [q.data]);

  const enviar = useMutation({
    mutationFn: () => api.post(`/correo/documentos/${doc.id}/enviar`, { ...f, adjuntos: [...adjuntos] }),
    onSuccess: () => {
      toast.success(`Correo enviado a ${f.para}`);
      qc.invalidateQueries({ queryKey: ["correos-enviados", doc.id] });
      onOpenChange(false);
    },
    onError: (e) => { toast.error((e as Error).message); qc.invalidateQueries({ queryKey: ["correos-enviados", doc.id] }); },
  });

  const fila = "flex items-center gap-2 border-b border-stroke py-1.5";
  const etiqueta = "w-16 shrink-0 text-sm text-muted";
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Enviar por correo" className="max-w-3xl"
      footer={q.data?.cuenta ? <>
        <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button variant="primary" disabled={enviar.isPending || !f.para.trim() || !f.asunto.trim()} onClick={() => enviar.mutate()}>
          <Send size={16} /> {enviar.isPending ? "Enviando…" : "Enviar"}
        </Button>
      </> : <Button onClick={() => onOpenChange(false)}>Cerrar</Button>}>
      {q.isLoading ? <Loading /> : !q.data ? null : !q.data.cuenta ? (
        <div className="rounded bg-warning/10 p-4 text-sm">
          <p className="font-semibold">Todavía no has conectado tu cuenta de correo.</p>
          <p className="mt-1">Conéctala en <Link to="/ajustes?pestana=correo" className="font-semibold text-brand-fg hover:underline" onClick={() => onOpenChange(false)}>Ajustes → Correo</Link> (Google, Microsoft 365 u otro proveedor) y vuelve a intentarlo.</p>
        </div>
      ) : (
        <div>
          <div className={fila}>
            <span className={etiqueta}>De</span>
            <span className="text-sm">{q.data.cuenta.nombre ? `${q.data.cuenta.nombre} <${q.data.cuenta.email}>` : q.data.cuenta.email}
              <span className="ml-2 text-xs text-muted">({PROVEEDOR[q.data.cuenta.proveedor]})</span></span>
          </div>
          <div className={fila}>
            <span className={etiqueta}>Para</span>
            <Input value={f.para} onChange={(e) => setF({ ...f, para: e.target.value })} className="border-transparent" placeholder="correo@cliente.es (varios separados por comas)" />
            {!verCopias ? <button className="shrink-0 text-xs font-semibold text-brand-fg hover:underline" onClick={() => setVerCopias(true)}>CC / CCO</button> : null}
          </div>
          {!f.para ? <p className="py-1 text-xs text-warning">Este {doc.proveedor_id ? "proveedor" : "cliente"} no tiene email en su ficha: escríbelo aquí.</p> : null}
          {verCopias ? (
            <>
              <div className={fila}><span className={etiqueta}>CC</span><Input value={f.cc} onChange={(e) => setF({ ...f, cc: e.target.value })} className="border-transparent" /></div>
              <div className={fila}><span className={etiqueta}>CCO</span><Input value={f.cco} onChange={(e) => setF({ ...f, cco: e.target.value })} className="border-transparent" /></div>
            </>
          ) : null}
          <div className={fila}>
            <span className={etiqueta}>Asunto</span>
            <Input value={f.asunto} onChange={(e) => setF({ ...f, asunto: e.target.value })} className="border-transparent font-semibold" />
          </div>
          <Textarea value={f.cuerpo} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} rows={11} className="mt-2 border-transparent" aria-label="Mensaje" />
          <div className="mt-2 border-t border-stroke pt-2">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted"><Paperclip size={13} /> Adjuntos</p>
            <div className="flex flex-wrap gap-2">
              {q.data.adjuntos.map((a) => (
                <label key={a.id} className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs ${adjuntos.has(a.id) ? "border-brand-fg bg-brand-soft" : "border-stroke"}`}>
                  <input type="checkbox" checked={adjuntos.has(a.id)} onChange={(e) => { const n = new Set(adjuntos); if (e.target.checked) n.add(a.id); else n.delete(a.id); setAdjuntos(n); }} />
                  {a.tipo === "pdf" ? <FileText size={13} /> : null} {a.nombre}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
