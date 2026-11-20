import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useApariencia } from "@/hooks/apariencia";
import { ArrowLeft, FileText, KeyRound, Phone } from "lucide-react";
import { toast } from "sonner";
import { entrarConPasskey, navegadorAdmitePasskeys, claveValida } from "@/lib/seguridad";
import { Aviso, BotonReenviar, CampoCodigo, RequisitosClave } from "@/components/Seguridad";
import { api } from "@/lib/api";
import { useSesion } from "@/hooks/sesion";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

/** Marco común de las pantallas de acceso: panel de marca con mosaicos a la izquierda. */
export function PantallaAcceso({ children, ancho = "max-w-sm" }: { children: ReactNode; ancho?: string }) {
  const { fondos, intervalo, texto_login } = useApariencia();
  const [actual, setActual] = useState(0);
  // Las fotos de inicio de sesión rotan si el administrador ha subido más de una
  useEffect(() => {
    if (fondos.length < 2) return;
    const t = setInterval(() => setActual((i) => (i + 1) % fondos.length), (intervalo || 8) * 1000);
    return () => clearInterval(t);
  }, [fondos.length, intervalo]);
  return (
    <div className="flex min-h-full">
      <div className="relative hidden w-[42%] overflow-hidden bg-brand p-10 text-white lg:flex lg:flex-col">
        {fondos.map((f, i) => (
          <img key={f} src={f} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
            style={{ opacity: i === actual ? 1 : 0 }} />
        ))}
        {fondos.length ? <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/30" aria-hidden /> : null}
        <div className="relative flex items-center gap-2 text-lg font-semibold"><FileText /> 7Factura</div>
        {fondos.length ? (
          texto_login ? <p className="relative mt-auto max-w-sm text-lg font-semibold drop-shadow">{texto_login}</p> : <div className="mt-auto" />
        ) : (
        <div className="mt-auto grid max-w-md grid-cols-3 gap-2" aria-hidden>
          <div className="col-span-2 aspect-[2/1] bg-white/15 p-3 text-sm font-semibold">Facturas</div>
          <div className="aspect-square bg-white/25" />
          <div className="aspect-square bg-white/10" />
          <div className="col-span-2 aspect-[2/1] bg-white/20 p-3 text-sm font-semibold">Clientes</div>
          <div className="col-span-3 aspect-[3/1] bg-white/10 p-3 text-sm font-semibold">Presupuestos · Informes · Plugins</div>
        </div>
        )}
        {!fondos.length ? <p className="mt-8 max-w-sm text-white/80">Facturación sencilla para autónomos y pymes. Código abierto, tus datos en tu servidor.</p> : null}
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className={`w-full ${ancho}`}>{children}</div>
      </div>
    </div>
  );
}

export default function Login() {
  const { recargar, seguridad } = useSesion();
  const [modo, setModo] = useState<"entrar" | "recuperar">("entrar");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bloqueada, setBloqueada] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const conPasskey = !!seguridad?.passkeys && navegadorAdmitePasskeys();

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await api.post<{ passkeys: number }>("/login", { usuario, password });
      if (!r.passkeys && conPasskey) sessionStorage.setItem("fx-ofrecer-passkey", "1");
      await recargar();
    } catch (err) {
      setError((err as Error).message);
      setBloqueada(/bloqueada/i.test((err as Error).message));
    } finally {
      setEnviando(false);
    }
  }
  async function passkey() {
    setError(null);
    try { await entrarConPasskey(); await recargar(); } catch (err) { setError((err as Error).message); }
  }

  if (modo === "recuperar") return <PantallaAcceso><Recuperar usuarioInicial={usuario} volver={() => { setModo("entrar"); setError(null); setBloqueada(false); }} /></PantallaAcceso>;

  return (
    <PantallaAcceso>
      <form onSubmit={entrar} className="card space-y-4 p-8">
        <div>
          <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
          <p className="text-sm text-muted">Accede a tu cuenta de 7Factura</p>
        </div>
        <Field label="Usuario">
          <Input autoFocus autoComplete="username webauthn" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
        </Field>
        <Field label="Contraseña">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error ? <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}
          {bloqueada && seguridad?.recuperacion ? <> <button type="button" className="font-semibold underline" onClick={() => setModo("recuperar")}>Restablecer ahora</button></> : null}</p> : null}
        <Button type="submit" variant="primary" className="w-full" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</Button>
        {seguridad?.recuperacion ? <div className="text-center"><Button variant="subtle" size="sm" onClick={() => setModo("recuperar")}>¿Has olvidado tu contraseña?</Button></div> : null}
        {conPasskey ? (
          <>
            <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-stroke" />o<span className="h-px flex-1 bg-stroke" /></div>
            <Button className="w-full" onClick={passkey}><KeyRound size={16} /> Entrar con passkey</Button>
          </>
        ) : null}
      </form>
    </PantallaAcceso>
  );
}

/** Recuperación de la contraseña: usuario → código por WhatsApp → nueva contraseña. */
function Recuperar({ usuarioInicial, volver }: { usuarioInicial: string; volver: () => void }) {
  const { recargar } = useSesion();
  const [paso, setPaso] = useState<"usuario" | "codigo" | "clave">("usuario");
  const [usuario, setUsuario] = useState(usuarioInicial);
  const [codigo, setCodigo] = useState("");
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [reenvios, setReenvios] = useState(0);

  async function solicitar(e?: FormEvent) {
    e?.preventDefault(); setError(null); setOcupado(true);
    try { await api.post("/recuperar/solicitar", { usuario: usuario.trim() }); setPaso("codigo"); setCodigo(""); setReenvios((n) => n + 1); }
    catch (x) { setError((x as Error).message); } finally { setOcupado(false); }
  }
  async function comprobar(c = codigo) {
    if (c.length !== 6) { setError("El código tiene 6 cifras."); return; }
    setError(null);
    try { await api.post("/recuperar/comprobar", { usuario: usuario.trim(), codigo: c }); setPaso("clave"); }
    catch (x) { setError((x as Error).message); }
  }
  async function confirmar(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!claveValida(clave)) { setError("La contraseña debe cumplir todos los requisitos."); return; }
    if (clave !== clave2) { setError("Las contraseñas no coinciden."); return; }
    setOcupado(true);
    try {
      await api.post("/recuperar/confirmar", { usuario: usuario.trim(), codigo, password: clave, confirmar: clave2 });
      toast.success("Contraseña restablecida. Ya has entrado.");
      await recargar();
    } catch (x) { setError((x as Error).message); if (/código/i.test((x as Error).message)) setTimeout(() => setPaso("codigo"), 1500); }
    finally { setOcupado(false); }
  }

  return (
    <div className="card space-y-4 p-8">
      <div>
        <Button variant="subtle" size="sm" className="-ml-2 mb-2" onClick={volver}><ArrowLeft size={14} /> Volver a iniciar sesión</Button>
        <h1 className="text-2xl font-semibold">Restablecer contraseña</h1>
        <p className="text-sm text-muted">Te enviaremos un código por WhatsApp al teléfono que verificaste en tu cuenta.</p>
      </div>
      {paso === "usuario" ? (
        <form onSubmit={solicitar} className="space-y-4">
          <Field label="Usuario"><Input autoFocus autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} required /></Field>
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <Button type="submit" variant="primary" className="w-full" disabled={ocupado}><Phone size={16} /> {ocupado ? "Enviando…" : "Enviarme el código por WhatsApp"}</Button>
        </form>
      ) : paso === "codigo" ? (
        <form onSubmit={(e) => { e.preventDefault(); comprobar(); }} className="space-y-4">
          <Aviso>Si <strong>{usuario}</strong> tiene un teléfono verificado, acabas de recibir un WhatsApp con el código. Caduca en 10 minutos.</Aviso>
          <CampoCodigo valor={codigo} onChange={setCodigo} onCompleto={comprobar} />
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <Button type="submit" variant="primary" className="w-full">Continuar</Button>
          <div className="flex items-center justify-between gap-2">
            <BotonReenviar reinicio={reenvios} onClick={() => solicitar()} />
            <span className="text-xs text-muted">¿No te llega? Avisa al administrador.</span>
          </div>
        </form>
      ) : (
        <form onSubmit={confirmar} className="space-y-4">
          <input type="text" autoComplete="username" value={usuario} readOnly hidden />
          <Field label="Nueva contraseña">
            <Input autoFocus type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
            <RequisitosClave clave={clave} />
          </Field>
          <Field label="Repite la contraseña"><Input type="password" autoComplete="new-password" value={clave2} onChange={(e) => setClave2(e.target.value)} /></Field>
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <Button type="submit" variant="primary" className="w-full" disabled={ocupado}>Guardar y entrar</Button>
        </form>
      )}
    </div>
  );
}
