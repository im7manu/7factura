import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, HandCoins } from "lucide-react";
import type { Avisos as TAvisos } from "@/lib/api";
import { eur, fecha } from "@/lib/utils";

/** Lista de avisos de cobro (próximos vencimientos e impagados). */
export function ListaAvisos({ avisos, max = 8, alPulsar }: { avisos: TAvisos; max?: number; alPulsar?: () => void }) {
  const filas = [
    ...avisos.impagados.map((a) => ({ ...a, tipo: "impagado" as const })),
    ...avisos.proximos.map((a) => ({ ...a, tipo: "proximo" as const })),
    ...(avisos.pagos || []).map((a) => ({ ...a, tipo: "pago" as const })),
  ];
  if (!filas.length) return <p className="px-3 py-4 text-center text-sm text-muted">No hay avisos de cobro.</p>;
  return (
    <ul className="divide-y divide-stroke/70">
      {filas.slice(0, max).map((a) => (
        <li key={`${a.tipo}${a.id}`}>
          <Link to={a.tipo === "pago" ? `/compras/facturas/${a.documento_id}` : `/facturas/${a.documento_id}`} onClick={alPulsar} className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-subtle">
            {a.tipo === "impagado" ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
              : a.tipo === "pago" ? <HandCoins size={16} className="mt-0.5 shrink-0 text-danger" />
              : <CalendarClock size={16} className="mt-0.5 shrink-0 text-brand-fg" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{a.cliente_nombre}</span>
              <span className="text-xs text-muted">{a.tipo === "pago" ? "Pagar " : ""}{a.codigo} · {a.tipo === "impagado" ? "venció" : "vence"} el {fecha(a.vencimiento)}</span>
            </span>
            <span className="shrink-0 font-semibold tnum">{eur(a.pendiente)}</span>
          </Link>
        </li>
      ))}
      {filas.length > max ? <li className="px-3 py-2 text-center text-xs"><Link to="/cobros" onClick={alPulsar} className="font-semibold text-brand-fg hover:underline">Ver los {filas.length} avisos</Link></li> : null}
    </ul>
  );
}
