import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Puzzle } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface Accion { plugin: string; titulo: string; url: string; proponer: boolean }

/**
 * Botones que los plugins añaden a un documento (p. ej. «Enviar por WhatsApp»). Cada uno abre la página del plugin
 * en una ventana. Tras emitir, se pregunta a los plugins si quieren proponer algo (evento «emitido»).
 * La página del plugin puede cerrar la ventana con Facturador.cerrar() y pedir que se recargue el documento con Facturador.actualizar().
 */
export function AccionesPlugins({ documentoId, emitidoEn }: { documentoId: number; emitidoEn: number }) {
  const qc = useQueryClient();
  const acciones = useQuery({ queryKey: ["acciones-plugins", documentoId], queryFn: () => api.get<Accion[]>(`/plugins/acciones/${documentoId}`), retry: false });
  const [abierta, setAbierta] = useState<Accion | null>(null);

  // Al emitir: abrir la primera acción que un plugin proponga
  useEffect(() => {
    if (!emitidoEn) return;
    api.get<Accion[]>(`/plugins/acciones/${documentoId}?evento=emitido`).then((l) => { const p = l.find((a) => a.proponer); if (p) setAbierta(p); }).catch(() => {});
  }, [emitidoEn, documentoId]);

  useEffect(() => {
    const oir = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || typeof e.data !== "object" || !e.data) return;
      if (e.data.tipo === "facturador:cerrar") setAbierta(null);
      if (e.data.tipo === "facturador:actualizar") { qc.invalidateQueries({ queryKey: ["documento", String(documentoId)] }); qc.invalidateQueries({ queryKey: ["documento"] }); }
    };
    window.addEventListener("message", oir);
    return () => window.removeEventListener("message", oir);
  }, [qc, documentoId]);

  if (!acciones.data?.length) return null;
  return (
    <>
      {acciones.data.map((a) => (
        <Button key={a.url} variant="subtle" onClick={() => setAbierta(a)}><Puzzle size={16} /> {a.titulo}</Button>
      ))}
      <Dialog open={!!abierta} onOpenChange={(v) => !v && setAbierta(null)} title={abierta?.titulo || ""} className="max-w-2xl">
        {abierta ? <iframe title={abierta.titulo} src={abierta.url} className="h-[70vh] w-full rounded border-0 bg-surface" /> : null}
      </Dialog>
    </>
  );
}
