import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, LogOut, Mail, Send, Server } from "lucide-react";
import { api, type AppOAuth, type EstadoCorreo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Loading } from "@/components/ui/misc";
import { TIPOS_DOC } from "@/lib/utils";

const PROVEEDOR: Record<string, string> = { google: "Google (Gmail / Google Workspace)", microsoft: "Microsoft 365 (Outlook / Exchange)", smtp: "SMTP" };
const fallo = (e: unknown) => toast.error((e as Error).message);

export function PestanaCorreo({ admin }: { admin: boolean }) {
  return (
    <div className="space-y-6">
      <MiCuenta />
      {admin ? <AppsEmpresa /> : null}
      <Plantillas admin={admin} />
    </div>
  );
}

// ---------- Cuenta del usuario ----------
function MiCuenta() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["correo-estado"], queryFn: () => api.get<EstadoCorreo>("/correo/estado") });
  const [perfil, setPerfil] = useState({ nombre: "", firma: "" });
  const [smtp, setSmtp] = useState({ host: "", puerto: 587, seguro: false, usuario: "", password: "", email: "", nombre: "" });
  const [verSmtp, setVerSmtp] = useState(false);
  useEffect(() => { if (q.data?.cuenta) setPerfil({ nombre: q.data.cuenta.nombre, firma: q.data.cuenta.firma }); }, [q.data]);
  const recargar = () => qc.invalidateQueries({ queryKey: ["correo-estado"] });

  const conectar = useMutation({
    mutationFn: (p: "google" | "microsoft") => api.get<{ url: string }>(`/correo/oauth/${p}/iniciar`),
    onSuccess: (r) => { window.location.href = r.url; },
    onError: fallo,
  });
  const guardarSmtp = useMutation({ mutationFn: () => api.post("/correo/smtp", smtp), onSuccess: () => { recargar(); setVerSmtp(false); toast.success("Cuenta conectada"); }, onError: fallo });
  const guardarPerfil = useMutation({ mutationFn: () => api.put("/correo/cuenta", perfil), onSuccess: () => { recargar(); toast.success("Guardado"); }, onError: fallo });
  const prueba = useMutation({ mutationFn: () => api.post<{ enviado_a: string }>("/correo/prueba"), onSuccess: (r) => toast.success(`Correo de prueba enviado a ${r.enviado_a}`), onError: fallo });
  const desconectar = useMutation({ mutationFn: () => api.del("/correo/cuenta"), onSuccess: () => { recargar(); toast.success("Cuenta desconectada"); }, onError: fallo });

  if (!q.data) return <Loading />;
  const c = q.data.cuenta;
  return (
    <section className="card max-w-3xl p-5">
      <h2 className="mb-1 text-base font-semibold">Mi cuenta de correo</h2>
      <p className="mb-4 text-sm text-muted">Los documentos se envían desde tu propio correo y quedan también en tu carpeta de enviados.</p>
      {c ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded bg-success/10 px-3 py-2 text-sm">
            <Mail size={18} className="text-success" />
            <span className="flex-1"><strong>{c.email}</strong> · {PROVEEDOR[c.proveedor]}</span>
            <Button size="sm" onClick={() => prueba.mutate()} disabled={prueba.isPending}><Send size={14} /> Enviar prueba</Button>
            <Button size="sm" variant="subtle" onClick={() => confirm("¿Desconectar tu cuenta de correo?") && desconectar.mutate()}><LogOut size={14} /> Desconectar</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre que verán los destinatarios"><Input value={perfil.nombre} onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })} /></Field>
            <Field label="Firma" hint="Se añade al final de cada correo" className="sm:col-span-2"><Textarea value={perfil.firma} onChange={(e) => setPerfil({ ...perfil, firma: e.target.value })} rows={3} /></Field>
          </div>
          <div className="flex justify-end"><Button variant="primary" onClick={() => guardarPerfil.mutate()}>Guardar</Button></div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <button disabled={!q.data.disponibles.google || conectar.isPending} onClick={() => conectar.mutate("google")}
              className="flex flex-col items-start gap-1 border border-stroke p-3 text-left hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50">
              <span className="text-sm font-semibold">Iniciar sesión con Google</span><span className="text-xs text-muted">Gmail o Google Workspace</span>
            </button>
            <button disabled={!q.data.disponibles.microsoft || conectar.isPending} onClick={() => conectar.mutate("microsoft")}
              className="flex flex-col items-start gap-1 border border-stroke p-3 text-left hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50">
              <span className="text-sm font-semibold">Iniciar sesión con Microsoft</span><span className="text-xs text-muted">Outlook, Hotmail o Exchange de Microsoft 365</span>
            </button>
            <button onClick={() => setVerSmtp((v) => !v)} className="flex flex-col items-start gap-1 border border-stroke p-3 text-left hover:bg-subtle">
              <span className="flex items-center gap-1 text-sm font-semibold"><Server size={14} /> Otro proveedor (SMTP)</span><span className="text-xs text-muted">Correo de tu hosting, Yahoo, IONOS…</span>
            </button>
          </div>
          {!q.data.disponibles.google || !q.data.disponibles.microsoft ? (
            <p className="text-xs text-muted">Para iniciar sesión con Google o Microsoft, el administrador tiene que configurar antes la aplicación (más abajo), o puedes usar la tuya propia.</p>
          ) : null}
          {verSmtp ? (
            <form className="grid gap-3 border-t border-stroke pt-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); guardarSmtp.mutate(); }}>
              <Field label="Tu correo *" className="sm:col-span-2"><Input type="email" value={smtp.email} onChange={(e) => setSmtp({ ...smtp, email: e.target.value })} required /></Field>
              <Field label="Nombre visible" className="sm:col-span-2"><Input value={smtp.nombre} onChange={(e) => setSmtp({ ...smtp, nombre: e.target.value })} /></Field>
              <Field label="Servidor SMTP *" className="sm:col-span-2"><Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.tudominio.es" required /></Field>
              <Field label="Puerto"><Input type="number" value={smtp.puerto} onChange={(e) => setSmtp({ ...smtp, puerto: Number(e.target.value) })} /></Field>
              <Field label="Cifrado">
                <Select value={smtp.seguro ? "ssl" : "starttls"} onChange={(e) => setSmtp({ ...smtp, seguro: e.target.value === "ssl", puerto: e.target.value === "ssl" ? 465 : 587 })}>
                  <option value="starttls">STARTTLS (587)</option><option value="ssl">SSL/TLS (465)</option>
                </Select>
              </Field>
              <Field label="Usuario" className="sm:col-span-2"><Input value={smtp.usuario} onChange={(e) => setSmtp({ ...smtp, usuario: e.target.value })} autoComplete="off" /></Field>
              <Field label="Contraseña" hint="Se guarda cifrada" className="sm:col-span-2"><Input type="password" value={smtp.password} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} autoComplete="new-password" /></Field>
              <div className="flex justify-end sm:col-span-4"><Button type="submit" variant="primary" disabled={guardarSmtp.isPending}>{guardarSmtp.isPending ? "Comprobando…" : "Conectar"}</Button></div>
            </form>
          ) : null}
          <details className="border-t border-stroke pt-3 text-sm">
            <summary className="cursor-pointer font-semibold">Usar mi propia aplicación de Google o Microsoft</summary>
            <p className="mt-2 text-xs text-muted">Solo si tu empresa no tiene una configurada o quieres usar otra. Sigue la guía del apartado del administrador.</p>
            <FormApps actual={q.data.mis_apps} urlRetorno={q.data.url_retorno} ruta="/correo/mis-apps" onGuardado={recargar} />
          </details>
        </div>
      )}
    </section>
  );
}

// ---------- Aplicaciones de la empresa (administrador) ----------
function AppsEmpresa() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["correo-apps"], queryFn: () => api.get<{ google: AppOAuth | null; microsoft: AppOAuth | null; url_retorno: string }>("/correo/apps") });
  if (!q.data) return null;
  return (
    <section className="card max-w-3xl p-5">
      <h2 className="mb-1 text-base font-semibold">Aplicaciones de Google y Microsoft (empresa)</h2>
      <p className="mb-3 text-sm text-muted">
        Para que los usuarios puedan «Iniciar sesión con Google o Microsoft», hay que registrar 7Factura una vez en cada plataforma.
        Se hace en unos 10 minutos. Los secretos se guardan cifrados y nunca se vuelven a mostrar.
      </p>
      <details className="mb-3 rounded bg-subtle p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Guía: Google (Gmail / Workspace)</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px]">
          <li>Entra en <strong>console.cloud.google.com</strong> y crea un proyecto (por ejemplo «7Factura»).</li>
          <li>En «APIs y servicios → Biblioteca», activa la <strong>Gmail API</strong>.</li>
          <li>En «Pantalla de consentimiento de OAuth», elige <em>Interno</em> si usáis Google Workspace, o <em>Externo</em> y añade como usuarios de prueba los correos de tu equipo.</li>
          <li>En «Credenciales → Crear credenciales → ID de cliente de OAuth», elige <em>Aplicación web</em>.</li>
          <li>En «URI de redireccionamiento autorizados» pega la dirección de abajo.</li>
          <li>Copia aquí el <strong>ID de cliente</strong> y el <strong>Secreto del cliente</strong>.</li>
        </ol>
      </details>
      <details className="mb-3 rounded bg-subtle p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Guía: Microsoft 365 (Outlook / Exchange)</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px]">
          <li>Entra en <strong>entra.microsoft.com</strong> → «Aplicaciones → Registros de aplicaciones → Nuevo registro».</li>
          <li>Tipos de cuenta: «Cuentas de cualquier directorio y cuentas personales» (o solo tu organización).</li>
          <li>URI de redirección: plataforma <em>Web</em>, pega la dirección de abajo.</li>
          <li>En «Permisos de API», añade de Microsoft Graph (delegados): <strong>Mail.Send</strong>, <strong>User.Read</strong>, <strong>offline_access</strong>.</li>
          <li>En «Certificados y secretos», crea un <strong>secreto de cliente</strong> y copia su <em>valor</em>.</li>
          <li>Copia aquí el <strong>Id. de aplicación (cliente)</strong> y el secreto. Inquilino: <code>common</code>, o el id de tu organización.</li>
        </ol>
      </details>
      <FormApps actual={q.data} urlRetorno={q.data.url_retorno} ruta="/correo/apps" onGuardado={() => { qc.invalidateQueries({ queryKey: ["correo-apps"] }); qc.invalidateQueries({ queryKey: ["correo-estado"] }); }} />
    </section>
  );
}

function FormApps({ actual, urlRetorno, ruta, onGuardado }: {
  actual: { google: AppOAuth | null; microsoft: AppOAuth | null }; urlRetorno: string; ruta: string; onGuardado: () => void;
}) {
  const [g, setG] = useState({ client_id: actual.google?.client_id || "", client_secret: "" });
  const [m, setM] = useState({ client_id: actual.microsoft?.client_id || "", client_secret: "", tenant: actual.microsoft?.tenant || "common" });
  const guardar = useMutation({
    mutationFn: () => api.put(ruta, {
      google: g.client_id ? g : null,
      microsoft: m.client_id ? m : null,
    }),
    onSuccess: () => { onGuardado(); setG({ ...g, client_secret: "" }); setM({ ...m, client_secret: "" }); toast.success("Aplicaciones guardadas"); },
    onError: fallo,
  });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); guardar.mutate(); }}>
      <Field label="Dirección de redirección (cópiala en Google y Microsoft)">
        <div className="flex gap-1">
          <Input value={urlRetorno} readOnly className="font-mono text-xs" />
          <Button size="icon" onClick={() => { navigator.clipboard?.writeText(urlRetorno); toast.success("Copiado"); }} aria-label="Copiar"><Copy size={16} /></Button>
        </div>
      </Field>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold">Google {actual.google?.configurado ? <span className="ml-1 text-xs font-normal text-success">· configurada</span> : null}</legend>
        <Field label="ID de cliente"><Input value={g.client_id} onChange={(e) => setG({ ...g, client_id: e.target.value })} className="font-mono text-xs" /></Field>
        <Field label="Secreto del cliente" hint={actual.google?.configurado ? "Déjalo vacío para mantener el actual" : undefined}>
          <Input type="password" value={g.client_secret} onChange={(e) => setG({ ...g, client_secret: e.target.value })} autoComplete="new-password" />
        </Field>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-semibold">Microsoft {actual.microsoft?.configurado ? <span className="ml-1 text-xs font-normal text-success">· configurada</span> : null}</legend>
        <Field label="Id. de aplicación (cliente)"><Input value={m.client_id} onChange={(e) => setM({ ...m, client_id: e.target.value })} className="font-mono text-xs" /></Field>
        <Field label="Secreto" hint={actual.microsoft?.configurado ? "Vacío = mantener" : undefined}>
          <Input type="password" value={m.client_secret} onChange={(e) => setM({ ...m, client_secret: e.target.value })} autoComplete="new-password" />
        </Field>
        <Field label="Inquilino"><Input value={m.tenant} onChange={(e) => setM({ ...m, tenant: e.target.value })} className="font-mono text-xs" /></Field>
      </fieldset>
      <div className="flex justify-end"><Button type="submit" variant="primary" disabled={guardar.isPending}>Guardar aplicaciones</Button></div>
    </form>
  );
}

// ---------- Plantillas ----------
function Plantillas({ admin }: { admin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["correo-plantillas"], queryFn: () => api.get<{ plantillas: Record<string, { asunto: string; cuerpo: string }>; variables: string }>("/correo/plantillas") });
  const [tipo, setTipo] = useState("factura");
  const [p, setP] = useState<Record<string, { asunto: string; cuerpo: string }>>({});
  useEffect(() => { if (q.data) setP(q.data.plantillas); }, [q.data]);
  const guardar = useMutation({
    mutationFn: () => api.put("/correo/plantillas", { plantillas: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["correo-plantillas"] }); toast.success("Plantillas guardadas"); },
    onError: fallo,
  });
  if (!q.data || !p[tipo]) return <Loading />;
  return (
    <section className="card max-w-3xl p-5">
      <h2 className="mb-1 text-base font-semibold">Plantillas de correo</h2>
      <p className="mb-3 text-sm text-muted">Texto que aparece al enviar cada tipo de documento. Siempre se puede cambiar antes de enviar.</p>
      <div className="grid gap-3">
        <Field label="Tipo de documento" className="max-w-xs">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.keys(p).map((t) => <option key={t} value={t}>{TIPOS_DOC[t as keyof typeof TIPOS_DOC]?.singular || t}</option>)}
          </Select>
        </Field>
        <Field label="Asunto"><Input value={p[tipo].asunto} disabled={!admin} onChange={(e) => setP({ ...p, [tipo]: { ...p[tipo], asunto: e.target.value } })} /></Field>
        <Field label="Mensaje"><Textarea value={p[tipo].cuerpo} disabled={!admin} rows={8} onChange={(e) => setP({ ...p, [tipo]: { ...p[tipo], cuerpo: e.target.value } })} /></Field>
        <p className="text-xs text-muted">Variables: {q.data.variables.split(" ").map((v) => <code key={v} className="mr-1 rounded bg-subtle px-1">{v}</code>)}</p>
        {admin ? <div className="flex justify-end"><Button variant="primary" onClick={() => guardar.mutate()} disabled={guardar.isPending}>Guardar plantillas</Button></div>
          : <p className="text-xs text-muted">Solo un administrador puede cambiar las plantillas.</p>}
      </div>
    </section>
  );
}
