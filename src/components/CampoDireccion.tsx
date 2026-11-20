import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface DireccionEncontrada { etiqueta: string; calle: string; cp: string; ciudad: string; provincia: string; lat: number; lon: number }

/**
 * Campo de dirección con sugerencias mientras se escribe. Las ofrece un plugin (p. ej. «Rutas y mapas»);
 * sin él se comporta como un campo de texto normal. Al elegir una sugerencia llama a onElegir con calle, C.P., ciudad y provincia.
 */
export function CampoDireccion({ value, onChange, onElegir, className, disabled }: {
  value: string; onChange: (v: string) => void; onElegir: (d: DireccionEncontrada) => void; className?: string; disabled?: boolean;
}) {
  const disponible = useQuery({ queryKey: ["direcciones-disponible"], queryFn: () => api.get<{ disponible: boolean }>("/direcciones/disponible"), staleTime: 300_000, retry: false });
  const [res, setRes] = useState<DireccionEncontrada[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [idx, setIdx] = useState(-1);
  const escrito = useRef(false), seq = useRef(0);

  useEffect(() => {
    if (!disponible.data?.disponible || !escrito.current) return;
    const q = value.trim();
    if (q.length < 3) { setRes([]); return; }
    const t = setTimeout(async () => {
      const mio = ++seq.current;
      try {
        const r = await api.get<{ resultados: DireccionEncontrada[] }>(`/direcciones?q=${encodeURIComponent(q)}`);
        if (mio === seq.current) { setRes(r.resultados); setIdx(-1); setAbierto(true); }
      } catch { /* sin servicio de mapas: se escribe a mano */ }
    }, 300);
    return () => clearTimeout(t);
  }, [value, disponible.data?.disponible]);

  const elegir = (d: DireccionEncontrada) => { escrito.current = false; setAbierto(false); setRes([]); onElegir(d); };
  const ver = abierto && res.length > 0;
  return (
    <div className="relative">
      <Input
        value={value} disabled={disabled} className={className} autoComplete="off" role="combobox" aria-expanded={ver}
        onChange={(e) => { escrito.current = true; onChange(e.target.value); }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (!ver) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + res.length) % res.length); }
          else if (e.key === "Enter" && idx >= 0) { e.preventDefault(); elegir(res[idx]); }
          else if (e.key === "Escape") setAbierto(false);
        }}
      />
      {ver && (
        <div role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded border border-stroke bg-surface shadow-lg">
          {res.map((d, i) => (
            <div key={`${d.lat},${d.lon},${i}`} role="option" aria-selected={i === idx}
              onMouseDown={(e) => { e.preventDefault(); elegir(d); }}
              className={cn("flex cursor-pointer gap-2 px-3 py-2 text-sm hover:bg-subtle", i === idx && "bg-subtle")}>
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <div className="min-w-0">
                <div className="truncate">{d.calle || d.etiqueta}</div>
                <div className="truncate text-xs text-muted">{[d.cp, d.ciudad, d.provincia !== d.ciudad ? d.provincia : ""].filter(Boolean).join(" · ") || d.etiqueta}</div>
              </div>
            </div>
          ))}
          <div className="border-t border-stroke px-3 py-1.5 text-xs text-muted">Elige una dirección para rellenar el C.P., la ciudad y la provincia</div>
        </div>
      )}
    </div>
  );
}
