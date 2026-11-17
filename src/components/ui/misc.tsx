import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const COLORES_ESTADO: Record<string, string> = {
  borrador: "bg-subtle text-muted",
  emitida: "bg-brand-soft text-brand-fg",
  emitido: "bg-brand-soft text-brand-fg",
  pagada: "bg-success/15 text-success",
  aceptado: "bg-success/15 text-success",
  facturado: "bg-success/15 text-success",
  facturada: "bg-success/15 text-success",
  anulada: "bg-danger/15 text-danger",
  servido: "bg-brand-soft text-brand-fg",
  firmado: "bg-success/15 text-success",
  cancelado: "bg-danger/15 text-danger",
  recibido: "bg-success/15 text-success",
  rechazado: "bg-danger/15 text-danger",
  vencida: "bg-warning/15 text-warning",
};

export function EstadoBadge({ estado, vencida, compra }: { estado: string; vencida?: boolean; compra?: boolean }) {
  const clave = vencida && estado === "emitida" ? "vencida" : estado;
  const texto = clave === "vencida" ? (compra ? "Pago vencido" : "Vencida")
    : compra && estado === "emitida" ? "Pendiente de pago"
    : compra && estado === "emitido" ? "Registrado"
    : estado.charAt(0).toUpperCase() + estado.slice(1);
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", COLORES_ESTADO[clave] || "bg-subtle text-muted")}>
      {texto}
    </span>
  );
}

/** Encabezado de página con título y barra de comandos (estilo Office). */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CommandBar({ children }: { children: ReactNode }) {
  return <div className="card mb-4 flex flex-wrap items-center gap-1 p-1">{children}</div>;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 text-brand-fg">{icon}</div>
      <p className="text-base font-semibold">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-fg border-t-transparent", className)} aria-label="Cargando" />;
}

export function Loading() {
  return <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>;
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("card overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
export const th = "px-3 py-2 text-left text-xs font-semibold text-muted border-b border-stroke whitespace-nowrap";
export const td = "px-3 py-2 border-b border-stroke/70 align-middle";
