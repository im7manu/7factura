// «Mi cuenta»: passkeys, teléfono para recuperar la contraseña y cambio de contraseña.
// También la pantalla obligatoria de verificación del teléfono y la propuesta de crear una passkey.
import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, Lock, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useSesion } from "@/hooks/sesion";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Loading, PageHeader } from "@/components/ui/misc";
import { Aviso, FormularioTelefono, RequisitosClave } from "@/components/Seguridad";
import { PantallaAcceso } from "@/pages/Login";
import { claveValida, crearPasskey, navegadorAdmitePasskeys, type Passkey } from "@/lib/seguridad";

interface Cuenta { telefono: string; telefono_verificado: boolean; whatsapp: boolean; passkeys_disponibles: boolean; passkeys: Passkey[] }
const fecha = (s: string | null) => (s ? new Date(`${s.replace(" ", "T")}Z`).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function MiCuenta() {
  const { usuario, recargar } = useSesion();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["cuenta"], queryFn: () => api.get<Cuenta>("/cuenta") });
  const [cambiandoTel, setCambiandoTel] = useState(false);
  const [f, setF] = useState({ actual: "", nueva: "", confirmar: "" });
  const [errorClave, setErrorClave] = useState<string | null>(null);
  if (!q.data) return <Loading />;
  const c = q.data;
  const puedePasskey = c.passkeys_disponibles && navegadorAdmitePasskeys();

  async function nuevaPasskey() {
    try { await crearPasskey(); await q.refetch(); recargar(); toast.success("Passkey creada"); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function quitar(p: Passkey) {
    if (!confirm(`¿Quitar la passkey «${p.nombre}»?\n\nYa no podrás entrar con ella. Bórrala también del gestor de contraseñas del dispositivo si quieres.`)) return;
    try { await api.del(`/passkeys/${encodeURIComponent(p.id)}`); await q.refetch(); recargar(); toast.success("Passkey eliminada"); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function cambiarClave(e: FormEvent) {
    e.preventDefault(); setErrorClave(null);
    if (!claveValida(f.nueva)) return setErrorClave("La contraseña nueva debe cumplir todos los requisitos.");
    if (f.nueva !== f.confirmar) return setErrorClave("Las contraseñas nuevas no coinciden.");
    try { await api.post("/cuenta/clave", f); setF({ actual: "", nueva: "", confirmar: "" }); toast.success("Contraseña cambiada"); }
    catch (x) { setErrorClave((x as Error).message); }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Mi cuenta" subtitle={`${usuario?.nombre} · ${usuario?.usuario} · ${usuario?.rol === "admin" ? "Administrador" : "Usuario"}`} />

      <section className="card mb-4 p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound size={18} /> Passkeys</h2>
          {puedePasskey ? <Button variant="primary" onClick={nuevaPasskey}><Plus size={16} /> Crear passkey</Button> : null}
        </div>
        <p className="mb-3 text-sm text-muted">Con una passkey entras con la huella, la cara o el PIN del dispositivo, sin contraseña. Crea una en cada dispositivo que uses; si usas iCloud, Google o 1Password, se sincroniza sola.</p>
        {!c.passkeys_disponibles ? <Aviso>Las passkeys solo funcionan cuando 7Factura se abre desde una dirección con dominio y HTTPS (no en la versión de escritorio, que usa 127.0.0.1).</Aviso>
          : !navegadorAdmitePasskeys() ? <Aviso>Este navegador no admite passkeys.</Aviso> : null}
        {c.passkeys.length ? (
          <ul className="divide-y divide-stroke">
            {c.passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div><p className="font-semibold">{p.nombre} {p.sincronizada ? <span className="ml-1 rounded bg-brand/10 px-1.5 py-0.5 text-xs font-normal">Sincronizada</span> : null}</p>
                  <p className="text-xs text-muted">Creada el {fecha(p.creada)} · Último uso: {fecha(p.ultimo_uso)}</p></div>
                <Button variant="subtle" size="sm" className="text-danger" onClick={() => quitar(p)}><Trash2 size={14} /> Quitar</Button>
              </li>
            ))}
          </ul>
        ) : <p className="py-3 text-center text-sm text-muted">Todavía no tienes ninguna passkey.</p>}
      </section>

      <section className="card mb-4 p-5">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold"><Phone size={18} /> Teléfono para recuperar la contraseña</h2>
        {!c.whatsapp ? <p className="text-sm text-muted">La recuperación por WhatsApp no está configurada. El administrador puede activarla en Ajustes › Seguridad.</p>
          : cambiandoTel ? <div className="max-w-sm"><FormularioTelefono alTerminar={async () => { setCambiandoTel(false); await q.refetch(); qc.invalidateQueries({ queryKey: ["usuarios"] }); toast.success("Teléfono verificado"); }} /></div>
          : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>{c.telefono ? <><span className="font-mono">{c.telefono}</span> {c.telefono_verificado ? <span className="ml-1 rounded bg-success/15 px-1.5 py-0.5 text-xs font-semibold text-success">Verificado</span> : <span className="ml-1 text-xs text-muted">Sin verificar</span>}</> : <span className="text-muted">Sin teléfono</span>}</p>
              <Button onClick={() => setCambiandoTel(true)}>{c.telefono ? <><Pencil size={14} /> Cambiar número</> : <><Plus size={14} /> Añadir teléfono</>}</Button>
            </div>
          )}
        {c.whatsapp ? <p className="mt-2 text-xs text-muted">Si olvidas la contraseña, pulsa «¿Has olvidado tu contraseña?» al entrar y te enviaremos un código por WhatsApp a este número.</p> : null}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Lock size={18} /> Cambiar contraseña</h2>
        <form onSubmit={cambiarClave} className="max-w-sm space-y-3">
          <input type="text" autoComplete="username" value={usuario?.usuario || ""} readOnly hidden />
          <Field label="Contraseña actual"><Input type="password" autoComplete="current-password" value={f.actual} onChange={(e) => setF({ ...f, actual: e.target.value })} required /></Field>
          <Field label="Nueva contraseña"><Input type="password" autoComplete="new-password" value={f.nueva} onChange={(e) => setF({ ...f, nueva: e.target.value })} required /><RequisitosClave clave={f.nueva} /></Field>
          <Field label="Repite la nueva contraseña"><Input type="password" autoComplete="new-password" value={f.confirmar} onChange={(e) => setF({ ...f, confirmar: e.target.value })} required /></Field>
          {errorClave ? <Aviso tipo="error">{errorClave}</Aviso> : null}
          <Button type="submit" variant="primary">Cambiar contraseña</Button>
          <p className="text-xs text-muted">Se cerrará la sesión en tus otros dispositivos.</p>
        </form>
      </section>
    </div>
  );
}

/** Pantalla obligatoria antes de usar la aplicación cuando falta verificar el teléfono. */
export function VerificarTelefono() {
  const { usuario, recargar, salir } = useSesion();
  return (
    <PantallaAcceso>
      <div className="card space-y-4 p-8">
        <div>
          <h1 className="text-2xl font-semibold">Verifica tu teléfono</h1>
          <p className="text-sm text-muted">Hola, {usuario?.nombre}. Para poder recuperar tu contraseña si la olvidas, necesitamos tu móvil con WhatsApp. Solo se usa para enviarte códigos de seguridad.</p>
        </div>
        <FormularioTelefono alTerminar={async () => { toast.success("Teléfono verificado"); await recargar(); }} />
        <Button variant="subtle" size="sm" onClick={salir}><LogOut size={14} /> Cerrar sesión</Button>
      </div>
    </PantallaAcceso>
  );
}

/** Tras entrar con contraseña, propone crear una passkey (como mucho una vez cada 30 días por navegador). */
export function OfertaPasskey() {
  const { usuario, seguridad, recargar } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (sessionStorage.getItem("fx-ofrecer-passkey") !== "1" || usuario?.verificar_telefono) return;
    sessionStorage.removeItem("fx-ofrecer-passkey");
    if (!seguridad?.passkeys || !navegadorAdmitePasskeys() || usuario?.passkeys) return;
    let ultima = 0;
    try { ultima = Number(localStorage.getItem("fx-oferta-passkey") || 0); } catch { /* sin almacenamiento */ }
    if (Date.now() - ultima < 30 * 864e5) return;
    try { localStorage.setItem("fx-oferta-passkey", String(Date.now())); } catch { /* sin almacenamiento */ }
    setAbierto(true);
  }, [usuario, seguridad]);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto} title="Entra sin contraseña"
      footer={<><Button onClick={() => setAbierto(false)}>Ahora no</Button><Button variant="primary" onClick={async () => {
        try { await crearPasskey(); setAbierto(false); recargar(); toast.success("Passkey creada. La próxima vez pulsa «Entrar con passkey»."); } catch (e) { setError((e as Error).message); }
      }}><KeyRound size={16} /> Crear passkey</Button></>}>
      <p className="mb-2">Crea una <strong>passkey</strong> y la próxima vez entrarás con la huella, la cara o el PIN de este dispositivo, sin escribir la contraseña.</p>
      <p className="text-sm text-muted">Es más segura que una contraseña: no se puede adivinar ni robar con una web falsa, y nunca se bloquea por intentos fallidos.</p>
      {error ? <div className="mt-3"><Aviso tipo="error">{error}</Aviso></div> : null}
    </Dialog>
  );
}
