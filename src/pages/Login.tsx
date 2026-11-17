import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useApariencia } from "@/hooks/apariencia";
import { FileText } from "lucide-react";
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
        <div className="relative flex items-center gap-2 text-lg font-semibold"><FileText /> Facturador</div>
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
  const { recargar } = useSesion();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post("/login", { usuario, password });
      await recargar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PantallaAcceso>
      <form onSubmit={entrar} className="card space-y-4 p-8">
        <div>
          <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
          <p className="text-sm text-muted">Accede a tu cuenta de Facturador</p>
        </div>
        <Field label="Usuario">
          <Input autoFocus autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
        </Field>
        <Field label="Contraseña">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error ? <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p> : null}
        <Button type="submit" variant="primary" className="w-full" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</Button>
      </form>
    </PantallaAcceso>
  );
}
