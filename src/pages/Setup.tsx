import { useState, type FormEvent } from "react";
import { BookOpen, ShieldCheck } from "lucide-react";
import { api, type Empresa } from "@/lib/api";
import { useSesion } from "@/hooks/sesion";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EmpresaForm, EMPRESA_VACIA } from "@/components/EmpresaForm";
import { PantallaAcceso } from "./Login";
import { cn } from "@/lib/utils";

const requisitos = [
  { t: "10 caracteres o más", ok: (p: string) => p.length >= 10 },
  { t: "Una minúscula", ok: (p: string) => /[a-z]/.test(p) },
  { t: "Una mayúscula", ok: (p: string) => /[A-Z]/.test(p) },
  { t: "Un número", ok: (p: string) => /\d/.test(p) },
  { t: "Un símbolo (!@#$%…)", ok: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function Setup() {
  const { recargar } = useSesion();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [u, setU] = useState({ nombre: "", usuario: "", email: "", password: "", repetir: "" });
  const [empresa, setEmpresa] = useState<Empresa>(EMPRESA_VACIA);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof u) => (e: { target: { value: string } }) => setU({ ...u, [k]: e.target.value });

  function siguiente(e: FormEvent) {
    e.preventDefault();
    if (!requisitos.every((r) => r.ok(u.password))) return setError("La contraseña no cumple los requisitos");
    if (u.password !== u.repetir) return setError("Las contraseñas no coinciden");
    setError(null);
    setPaso(2);
  }

  async function finalizar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post("/setup", { usuario: u, empresa });
      await recargar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PantallaAcceso ancho="max-w-xl">
      <div className="card mb-4 flex gap-3 p-4 text-sm">
        <ShieldCheck size={22} className="mt-0.5 shrink-0 text-success" />
        <div>
          <p className="font-semibold">Tus datos se quedan en este servidor</p>
          <p className="text-muted">Facturador se ejecuta en el servidor o el ordenador de tu empresa y guarda aquí toda la información. No se sube nada a la nube.</p>
          <a href="/manual-facturador.pdf" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-semibold text-brand-fg hover:underline">
            <BookOpen size={16} /> Leer el manual de uso (PDF)
          </a>
        </div>
      </div>
      <div className="card p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-fg">Paso {paso} de 2</p>
        <h1 className="mt-1 text-2xl font-semibold">{paso === 1 ? "Crea tu cuenta de administrador" : "Datos de tu empresa"}</h1>
        <p className="mb-5 text-sm text-muted">
          {paso === 1 ? "Es la primera vez que se abre Facturador en este servidor." : "Aparecerán como emisor en tus facturas. Puedes cambiarlos después en Ajustes."}
        </p>

        {paso === 1 ? (
          <form onSubmit={siguiente} className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre completo" className="sm:col-span-2"><Input value={u.nombre} onChange={set("nombre")} required autoFocus /></Field>
            <Field label="Usuario"><Input value={u.usuario} onChange={set("usuario")} required pattern="[a-zA-Z0-9._\-]{3,30}" autoComplete="username" /></Field>
            <Field label="Email"><Input value={u.email} onChange={set("email")} type="email" /></Field>
            <Field label="Contraseña"><Input value={u.password} onChange={set("password")} type="password" required autoComplete="new-password" /></Field>
            <Field label="Repite la contraseña"><Input value={u.repetir} onChange={set("repetir")} type="password" required autoComplete="new-password" /></Field>
            <ul className="grid grid-cols-2 gap-1 text-xs sm:col-span-2">
              {requisitos.map((r) => (
                <li key={r.t} className={cn(r.ok(u.password) ? "text-success" : "text-muted")}>{r.ok(u.password) ? "✓" : "○"} {r.t}</li>
              ))}
            </ul>
            {error ? <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2" role="alert">{error}</p> : null}
            <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary">Siguiente</Button></div>
          </form>
        ) : (
          <form onSubmit={finalizar} className="space-y-4">
            <EmpresaForm valor={empresa} onChange={setEmpresa} />
            {error ? <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p> : null}
            <div className="flex justify-between">
              <Button onClick={() => setPaso(1)}>Atrás</Button>
              <Button type="submit" variant="primary" disabled={enviando}>{enviando ? "Guardando…" : "Finalizar y entrar"}</Button>
            </div>
          </form>
        )}
      </div>
    </PantallaAcceso>
  );
}
