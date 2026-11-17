import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ChevronDown, Mail } from "lucide-react";
import { api, type CorreoEnviado } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Registro de los correos enviados de un documento. */
export function CorreosEnviados({ documentoId }: { documentoId: number }) {
  const q = useQuery({ queryKey: ["correos-enviados", documentoId], queryFn: () => api.get<CorreoEnviado[]>(`/correo/documentos/${documentoId}/enviados`) });
  const [abierto, setAbierto] = useState<number | null>(null);
  if (!q.data?.length) return null;
  return (
    <section className="card p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Mail size={16} /> Correos enviados ({q.data.length})</h2>
      <ul className="divide-y divide-stroke/70">
        {q.data.map((c) => (
          <li key={c.id} className="py-1.5 text-sm">
            <button className="flex w-full items-start gap-2 text-left" onClick={() => setAbierto(abierto === c.id ? null : c.id)} aria-expanded={abierto === c.id}>
              {c.estado === "enviado" ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" /> : <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.para}</span>
                <span className="block text-xs text-muted">{new Date(`${c.fecha}Z`).toLocaleString("es-ES")} · {c.usuario || c.desde}</span>
              </span>
              <ChevronDown size={14} className={cn("mt-1 shrink-0 text-muted transition-transform", abierto === c.id && "rotate-180")} />
            </button>
            {abierto === c.id ? (
              <div className="mt-2 space-y-1 rounded bg-subtle p-2 text-xs">
                <p><span className="text-muted">De:</span> {c.desde}</p>
                {c.cc ? <p><span className="text-muted">CC:</span> {c.cc}</p> : null}
                {c.cco ? <p><span className="text-muted">CCO:</span> {c.cco}</p> : null}
                <p><span className="text-muted">Asunto:</span> <strong>{c.asunto}</strong></p>
                {c.adjuntos.length ? <p><span className="text-muted">Adjuntos:</span> {c.adjuntos.join(", ")}</p> : null}
                {c.error ? <p className="text-danger">Error: {c.error}</p> : null}
                <pre className="mt-1 whitespace-pre-wrap font-sans">{c.cuerpo}</pre>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
