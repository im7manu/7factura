import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Download, RefreshCw, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Loading } from "@/components/ui/misc";

export interface EstadoActualizaciones {
  version: string; repo: string; supervisado: boolean; desactivadas: boolean; firma_configurada: boolean;
  ultima_comprobacion: string | null; error: string | null; instalando: boolean;
  disponible: { version: string; notas: string; publicada: string; tamano: number } | null;
  ajustes: { auto: boolean; hora_inicio: number; hora_fin: number };
  resultado: { estado: "ok" | "revertida"; desde: string; hasta: string; fecha: string; mensaje?: string } | null;
  historial: { fecha: string; evento: string; desde: string; hasta: string }[];
}

const fechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-ES") : "nunca");

export function PestanaActualizaciones() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["actualizaciones"], queryFn: () => api.get<EstadoActualizaciones>("/actualizaciones") });
  const [aj, setAj] = useState({ auto: false, hora_inicio: 3, hora_fin: 5 });
  useEffect(() => { if (q.data) setAj(q.data.ajustes); }, [q.data]);
  const recargar = () => qc.invalidateQueries({ queryKey: ["actualizaciones"] });
  const comprobar = useMutation({ mutationFn: () => api.post("/actualizaciones/comprobar"), onSuccess: recargar, onError: (e) => toast.error((e as Error).message) });
  const guardar = useMutation({ mutationFn: () => api.put("/actualizaciones/ajustes", aj), onSuccess: () => { recargar(); toast.success("Guardado"); }, onError: (e) => toast.error((e as Error).message) });
  const instalar = useMutation({
    mutationFn: () => api.post<{ version: string }>("/actualizaciones/instalar"),
    onSuccess: (r) => {
      toast.success(`Instalando la versión ${r.version}. La aplicación se reiniciará en unos segundos…`);
      const t = setInterval(async () => {
        try { const e = await fetch("/api/estado").then((x) => x.json()); if (e.version === r.version || e.version) { clearInterval(t); setTimeout(() => window.location.reload(), 1500); } } catch { /* reiniciando */ }
      }, 3000);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!q.data) return <Loading />;
  const d = q.data;

  return (
    <div className="max-w-3xl space-y-4">
      {d.resultado?.estado === "revertida" ? (
        <div className="flex gap-2 rounded bg-warning/10 p-3 text-sm"><RotateCcw size={18} className="shrink-0 text-warning" /><p>{d.resultado.mensaje}</p></div>
      ) : null}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Versión instalada: {d.version}</h2>
            <p className="text-sm text-muted">Se comprueba cada hora en github.com/{d.repo}. Última comprobación: {fechaHora(d.ultima_comprobacion)}</p>
          </div>
          <Button onClick={() => comprobar.mutate()} disabled={comprobar.isPending || d.desactivadas}><RefreshCw size={16} /> Comprobar ahora</Button>
        </div>
        {d.error ? <p className="mt-2 text-sm text-danger">{d.error}</p> : null}
        {d.desactivadas ? <p className="mt-3 text-sm text-muted">Las actualizaciones están desactivadas en este servidor (UPDATE_DISABLED=1).</p> : null}
        {d.disponible ? (
          <div className="mt-4 rounded border border-brand-fg/40 bg-brand-soft p-4">
            <p className="font-semibold">Hay una versión nueva: {d.disponible.version}</p>
            <p className="text-xs text-muted">Publicada el {fechaHora(d.disponible.publicada)}</p>
            {d.disponible.notas ? <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap font-sans text-sm">{d.disponible.notas}</pre> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => confirm(`¿Instalar la versión ${d.disponible!.version}? La aplicación se reiniciará (tarda menos de un minuto).`) && instalar.mutate()}
                disabled={instalar.isPending || !d.supervisado}><Download size={16} /> Instalar ahora</Button>
              {!d.supervisado ? <span className="text-xs text-warning">Arranca la aplicación con «npm start» o con Docker para poder actualizar.</span> : null}
            </div>
          </div>
        ) : !d.desactivadas ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-success"><CheckCircle2 size={16} /> Tienes la última versión.</p>
        ) : null}
      </section>

      <section className="card p-5">
        <h2 className="mb-2 text-base font-semibold">Actualización automática</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={aj.auto} onChange={(e) => setAj({ ...aj, auto: e.target.checked })} /> Instalar las versiones nuevas automáticamente
        </label>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="Entre las" className="w-24"><Input type="number" min={0} max={23} value={aj.hora_inicio} onChange={(e) => setAj({ ...aj, hora_inicio: Number(e.target.value) })} /></Field>
          <Field label="y las" className="w-24"><Input type="number" min={0} max={23} value={aj.hora_fin} onChange={(e) => setAj({ ...aj, hora_fin: Number(e.target.value) })} /></Field>
          <span className="pb-2 text-sm text-muted">horas (mejor de madrugada, cuando nadie la usa)</span>
          <Button onClick={() => guardar.mutate()}>Guardar</Button>
        </div>
      </section>

      <section className="card p-5 text-sm">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><ShieldCheck size={18} className="text-success" /> Cómo se protege una actualización</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Solo se aceptan paquetes con la <strong>firma digital del autor</strong> {d.firma_configurada ? "" : <span className="text-danger">(esta instalación no tiene la clave pública: no se instalará nada)</span>}.</li>
          <li>Se comprueba el paquete: que es Facturador, que la versión es más nueva, que el código no tiene errores y que la versión de Node es suficiente.</li>
          <li>Se hace una <strong>copia de la base de datos</strong> antes de cambiar nada. Tus datos (carpeta <code>data</code>) nunca se borran.</li>
          <li>La versión nueva se vigila durante un minuto. <strong>Si falla, se vuelve sola a la anterior</strong> y se restaura la copia.</li>
        </ol>
      </section>

      {d.historial.length ? (
        <section className="card p-5">
          <h2 className="mb-2 text-base font-semibold">Historial</h2>
          <ul className="space-y-1 text-sm">
            {d.historial.map((h, i) => (
              <li key={i} className="flex items-center gap-2">
                {h.evento === "actualizada" ? <CheckCircle2 size={15} className="text-success" /> : <TriangleAlert size={15} className="text-warning" />}
                <span>{fechaHora(h.fecha)}: {h.evento === "actualizada" ? `actualizada de ${h.desde} a ${h.hasta}` : `la ${h.hasta} falló; se volvió a la ${h.desde}`}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
