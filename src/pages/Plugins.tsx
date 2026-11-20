import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Github, Puzzle, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { api, ApiError, type Ajustes } from "@/lib/api";
import { useSesion } from "@/hooks/sesion";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Empty, Loading, PageHeader } from "@/components/ui/misc";

interface Manifest { id: string; nombre: string; version: string; descripcion?: string; autor?: string }
interface Instalado { id: string; version: string; activo: boolean; manifest: Manifest; instalado: string }
interface EntradaRegistro { id: string; nombre: string; version: string; descripcion?: string; autor?: string; url: string; sha256: string; repo?: string }

export default function Plugins() {
  const { usuario } = useSesion();
  const qc = useQueryClient();
  const instalados = useQuery({ queryKey: ["plugins"], queryFn: () => api.get<Instalado[]>("/plugins"), enabled: usuario?.rol === "admin" });
  const estadoPlugins = useQuery({ queryKey: ["plugins-estado"], queryFn: () => api.get<{ reinicio_pendiente: boolean }>("/plugins/estado"), enabled: usuario?.rol === "admin" });
  const reiniciar = useMutation({
    mutationFn: () => api.post("/plugins/reiniciar"),
    onSuccess: () => {
      toast.success("Reiniciando la aplicación…");
      // Espera a que vuelva a responder y recarga
      const t = setInterval(async () => { try { await fetch("/api/estado"); clearInterval(t); window.location.reload(); } catch { /* aún no */ } }, 2000);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const subirArchivo = useMutation({
    mutationFn: async (f: File) => {
      const r = await fetch("/api/plugins/subir", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/gzip" }, body: f });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo instalar");
      return j;
    },
    onSuccess: (j) => { refrescar(); qc.invalidateQueries({ queryKey: ["plugins-estado"] }); toast.success(`Plugin ${j.manifest.nombre} instalado`); },
    onError: (e) => toast.error((e as Error).message),
  });
  const registro = useQuery({ queryKey: ["plugins-registro"], queryFn: () => api.get<{ url: string; plugins: EntradaRegistro[] }>("/plugins/registro"), enabled: usuario?.rol === "admin" });
  const ajustes = useQuery({ queryKey: ["ajustes"], queryFn: () => api.get<Ajustes>("/ajustes") });
  const [url, setUrl] = useState("");
  useEffect(() => { if (ajustes.data) setUrl(ajustes.data.registro_plugins || ""); }, [ajustes.data]);

  const refrescar = () => { qc.invalidateQueries({ queryKey: ["plugins"] }); qc.invalidateQueries({ queryKey: ["plugins-menu"] }); qc.invalidateQueries({ queryKey: ["plugins-estado"] }); };
  const err = (e: unknown) => toast.error((e as Error).message);
  const instalar = useMutation({ mutationFn: (id: string) => api.post(`/plugins/${id}/instalar`), onSuccess: () => { refrescar(); toast.success("Plugin instalado"); }, onError: err });
  const activar = useMutation({ mutationFn: ({ id, activo }: { id: string; activo: boolean }) => api.post(`/plugins/${id}/activo`, { activo }), onSuccess: refrescar, onError: err });
  const quitar = useMutation({ mutationFn: (id: string) => api.del<{ aviso: string }>(`/plugins/${id}`), onSuccess: (r) => { refrescar(); toast.success(r.aviso); }, onError: err });
  const guardarUrl = useMutation({
    mutationFn: () => api.put("/ajustes/general", { registro_plugins: url }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ajustes"] }); qc.invalidateQueries({ queryKey: ["plugins-registro"] }); toast.success("Registro actualizado"); },
    onError: err,
  });

  if (usuario?.rol !== "admin") return <p className="text-muted">Solo los administradores pueden gestionar plugins.</p>;
  const porId = new Map((instalados.data || []).map((p) => [p.id, p]));

  return (
    <div>
      <PageHeader title="Plugins" subtitle="Amplía 7Factura con módulos descargables desde GitHub"
        actions={<Button onClick={() => { registro.refetch(); instalados.refetch(); }}><RefreshCw size={16} /> Actualizar</Button>} />

      {estadoPlugins.data?.reinicio_pendiente ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded bg-brand-soft p-3 text-sm">
          <RefreshCw size={18} className="shrink-0 text-brand-fg" />
          <p className="flex-1">Has actualizado un plugin que ya estaba en uso. <strong>Reinicia la aplicación</strong> para que se use entera la versión nueva.</p>
          <Button variant="primary" size="sm" onClick={() => reiniciar.mutate()} disabled={reiniciar.isPending}>Reiniciar ahora</Button>
        </div>
      ) : null}
      <div className="mb-4 flex gap-2 rounded bg-warning/10 p-3 text-sm">
        <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warning" />
        <p>Un plugin ejecuta código en tu servidor con los mismos permisos que la aplicación. Instala solo plugins de fuentes en las que confíes. Cada descarga se verifica con su huella SHA-256 del registro.</p>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">Instalados</h2>
        {instalados.isLoading ? <Loading /> : !instalados.data?.length ? (
          <div className="card"><Empty icon={<Puzzle size={36} />} title="Ningún plugin instalado" /></div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {instalados.data.map((p) => {
              const nueva = registro.data?.plugins.find((r) => r.id === p.id && r.version !== p.version);
              return (
                <div key={p.id} className="card flex items-start gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-tile-purple text-white"><Puzzle size={20} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.manifest.nombre} <span className="text-xs font-normal text-muted">v{p.version}</span></p>
                    <p className="text-sm text-muted">{p.manifest.descripcion}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button size="sm" onClick={() => activar.mutate({ id: p.id, activo: !p.activo })}>{p.activo ? "Desactivar" : "Activar"}</Button>
                      {nueva ? <Button size="sm" variant="primary" onClick={() => instalar.mutate(p.id)}><Download size={14} /> Actualizar a v{nueva.version}</Button> : null}
                      <Button size="sm" variant="subtle" className="text-danger" onClick={() => confirm(`¿Desinstalar ${p.manifest.nombre}?`) && quitar.mutate(p.id)}><Trash2 size={14} /> Desinstalar</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">Disponibles</h2>
        {registro.isLoading ? <Loading /> : registro.isError ? (
          <div className="card p-4 text-sm">
            <p className="font-semibold text-danger">No se pudo leer el registro de plugins.</p>
            <p className="mt-1 text-muted">{(registro.error as ApiError).message}. Comprueba que el repositorio y el archivo <code>registry.json</code> existen y son públicos.</p>
          </div>
        ) : !registro.data?.plugins.length ? (
          <div className="card"><Empty icon={<Github size={36} />} title="El registro está vacío">Publica plugins en tu repositorio de GitHub y añádelos a <code>registry.json</code>.</Empty></div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {registro.data.plugins.map((p) => (
              <div key={p.id} className="card flex items-start gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-tile-blue text-white"><Puzzle size={20} /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.nombre} <span className="text-xs font-normal text-muted">v{p.version}{p.autor ? ` · ${p.autor}` : ""}</span></p>
                  <p className="text-sm text-muted">{p.descripcion}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {porId.has(p.id) ? <span className="text-xs font-semibold text-success">Instalado</span> : (
                      <Button size="sm" variant="primary" disabled={instalar.isPending} onClick={() => instalar.mutate(p.id)}><Download size={14} /> Instalar</Button>
                    )}
                    {p.repo ? <a href={p.repo} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 px-2 text-[13px] font-semibold text-brand-fg hover:underline"><Github size={14} /> Código</a> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card mb-4 max-w-2xl p-4">
        <h2 className="mb-1 text-sm font-semibold">Instalar desde un archivo</h2>
        <p className="mb-2 text-xs text-muted">Para probar un plugin propio antes de publicarlo, o instalar sin conexión. Solo instala archivos de fuentes de confianza.</p>
        <input type="file" accept=".tar.gz,.tgz,application/gzip" disabled={subirArchivo.isPending}
          onChange={(e) => { const f = e.target.files?.[0]; if (f && confirm(`¿Instalar el plugin del archivo «${f.name}»? Ejecutará código en el servidor.`)) subirArchivo.mutate(f); e.target.value = ""; }} />
      </section>

      <section className="card max-w-2xl p-4">
        <form onSubmit={(e) => { e.preventDefault(); guardarUrl.mutate(); }} className="flex flex-wrap items-end gap-2">
          <Field label="Registro de plugins" hint={`Vacío = registro oficial (${registro.data?.url || "GitHub del autor"})`} className="min-w-[260px] flex-1">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://raw.githubusercontent.com/usuario/repo/main/registry.json" />
          </Field>
          <Button type="submit">Guardar</Button>
        </form>
      </section>
    </div>
  );
}
