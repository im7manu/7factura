import { Plus, Trash2 } from "lucide-react";
import type { Plazo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Editor de plazos de pago: días desde la fecha de la factura y porcentaje del total. */
export function PlazosEditor({ valor, onChange, disabled }: { valor: Plazo[]; onChange: (p: Plazo[]) => void; disabled?: boolean }) {
  const suma = Math.round(valor.reduce((s, p) => s + (Number(p.pct) || 0), 0) * 100) / 100;
  const set = (i: number, c: Partial<Plazo>) => onChange(valor.map((p, j) => (j === i ? { ...p, ...c } : p)));
  const repartir = (n: number) => {
    const base = Math.floor((100 / n) * 100) / 100;
    onChange(Array.from({ length: n }, (_, i) => ({ dias: 30 * (i + 1), pct: i === n - 1 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base })));
  };
  return (
    <div className="space-y-2">
      {valor.length ? (
        <table className="text-sm">
          <thead><tr className="text-xs text-muted"><th className="pr-2 text-left font-semibold">Plazo</th><th className="pr-2 text-left font-semibold">Días</th><th className="pr-2 text-left font-semibold">% del total</th><th /></tr></thead>
          <tbody>
            {valor.map((p, i) => (
              <tr key={i}>
                <td className="pr-2 text-muted">{i + 1}º</td>
                <td className="py-0.5 pr-2"><Input type="number" min={0} value={p.dias} onChange={(e) => set(i, { dias: Number(e.target.value) })} disabled={disabled} className="h-7 w-20 text-right tnum" aria-label={`Días del plazo ${i + 1}`} /></td>
                <td className="py-0.5 pr-2"><Input type="number" min={0} step="any" value={p.pct} onChange={(e) => set(i, { pct: Number(e.target.value) })} disabled={disabled} className="h-7 w-20 text-right tnum" aria-label={`Porcentaje del plazo ${i + 1}`} /></td>
                <td>{!disabled ? <Button size="icon" variant="subtle" className="h-7 w-7" onClick={() => onChange(valor.filter((_, j) => j !== i))} aria-label="Quitar plazo"><Trash2 size={14} /></Button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-xs text-muted">Un solo vencimiento.</p>}
      {!disabled ? (
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" onClick={() => onChange([...valor, { dias: (valor.at(-1)?.dias || 0) + 30, pct: 0 }])}><Plus size={14} /> Añadir plazo</Button>
          <span className="ml-1 text-xs text-muted">Atajos:</span>
          {[2, 3, 4].map((n) => <Button key={n} size="sm" variant="subtle" onClick={() => repartir(n)}>{Array.from({ length: n }, (_, i) => 30 * (i + 1)).join("-")}</Button>)}
          {valor.length ? <Button size="sm" variant="subtle" onClick={() => onChange([])}>Un solo pago</Button> : null}
        </div>
      ) : null}
      {valor.length > 1 ? <p className={cn("text-xs", Math.abs(suma - 100) > 0.05 ? "text-danger" : "text-muted")}>Suma: {suma} % {Math.abs(suma - 100) > 0.05 ? "(debe ser 100 %)" : ""}</p> : null}
    </div>
  );
}
