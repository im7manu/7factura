// Piezas comunes de seguridad: campo de código, cuenta atrás de reenvío, requisitos de la contraseña y
// formulario de verificación del teléfono por WhatsApp.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Circle, Pencil, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { REQUISITOS_CLAVE, limpiaCodigo } from "@/lib/seguridad";
import { cn } from "@/lib/utils";

export function Aviso({ children, tipo = "info" }: { children: React.ReactNode; tipo?: "info" | "error" }) {
  return <p className={cn("rounded px-3 py-2 text-sm", tipo === "error" ? "bg-danger/10 text-danger" : "bg-brand/10")} role={tipo === "error" ? "alert" : undefined}>{children}</p>;
}

/** Campo para el código de 6 cifras. Llama a onCompleto cuando se escriben o pegan las 6 cifras. */
export function CampoCodigo({ valor, onChange, onCompleto }: { valor: string; onChange: (v: string) => void; onCompleto?: (v: string) => void }) {
  return (
    <Field label="Código de 6 cifras">
      <Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000" value={valor}
        className="h-11 text-center font-mono text-xl tracking-[0.4em]"
        onChange={(e) => { const v = limpiaCodigo(e.target.value); onChange(v); if (v.length === 6 && onCompleto) onCompleto(v); }} />
    </Field>
  );
}

/** Botón «Reenviar código» que se habilita al cabo de 60 s. */
export function BotonReenviar({ onClick, reinicio }: { onClick: () => Promise<void>; reinicio: number }) {
  const [s, setS] = useState(60);
  useEffect(() => {
    setS(60);
    const t = setInterval(() => setS((x) => (x > 0 ? x - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [reinicio]);
  return <Button variant="subtle" size="sm" disabled={s > 0} onClick={onClick}>Reenviar código{s > 0 ? ` (${s} s)` : ""}</Button>;
}

export function RequisitosClave({ clave }: { clave: string }) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
      {REQUISITOS_CLAVE.map(([f, t]) => {
        const ok = f(clave);
        return <li key={t} className={cn("flex items-center gap-1", ok ? "font-semibold text-success" : "text-muted")}>{ok ? <Check size={12} /> : <Circle size={10} />} {t}</li>;
      })}
    </ul>
  );
}

/** Número → código por WhatsApp → verificado. */
export function FormularioTelefono({ alTerminar }: { alTerminar: (telefono: string) => void }) {
  const [paso, setPaso] = useState<"numero" | "codigo">("numero");
  const [tel, setTel] = useState("");
  const [oculto, setOculto] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [reenvios, setReenvios] = useState(0);
  const enviandoCodigo = useRef(false);

  async function pedir(e?: FormEvent) {
    e?.preventDefault(); setError(null); setOcupado(true);
    try {
      const r = await api.post<{ telefono: string }>("/cuenta/telefono", { telefono: tel });
      setOculto(r.telefono); setCodigo(""); setPaso("codigo"); setReenvios((n) => n + 1);
    } catch (x) { setError((x as Error).message); } finally { setOcupado(false); }
  }
  async function verificar(c = codigo) {
    if (enviandoCodigo.current) return;
    if (c.length !== 6) { setError("El código tiene 6 cifras."); return; }
    enviandoCodigo.current = true; setError(null);
    try { const r = await api.post<{ telefono: string }>("/cuenta/telefono/verificar", { codigo: c }); alTerminar(r.telefono); }
    catch (x) { setError((x as Error).message); } finally { enviandoCodigo.current = false; }
  }

  if (paso === "numero") return (
    <form onSubmit={pedir} className="space-y-3">
      <Field label="Móvil con WhatsApp" hint="Si no es un número español, escríbelo con el prefijo del país (p. ej. +351…).">
        <Input autoFocus type="tel" inputMode="tel" autoComplete="tel" placeholder="600 000 000" value={tel} onChange={(e) => setTel(e.target.value)} required />
      </Field>
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <Button type="submit" variant="primary" className="w-full" disabled={ocupado}><Phone size={16} /> {ocupado ? "Enviando…" : "Enviarme el código"}</Button>
    </form>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); verificar(); }} className="space-y-3">
      <Aviso>Te hemos enviado un WhatsApp al <strong>{oculto}</strong> con un código de 6 cifras.</Aviso>
      <CampoCodigo valor={codigo} onChange={setCodigo} onCompleto={verificar} />
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <Button type="submit" variant="primary" className="w-full"><Check size={16} /> Verificar</Button>
      <div className="flex justify-between gap-2">
        <Button variant="subtle" size="sm" onClick={() => setPaso("numero")}><Pencil size={14} /> Cambiar número</Button>
        <BotonReenviar reinicio={reenvios} onClick={() => pedir()} />
      </div>
    </form>
  );
}
