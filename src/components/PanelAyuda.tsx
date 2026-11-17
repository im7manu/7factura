import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, LifeBuoy, X } from "lucide-react";
import { CajaBusquedaAyuda, PreguntaPlegable, ResultadosAyuda, contextoAyuda, preguntaPorId } from "@/components/ayuda";

/** Panel lateral de ayuda: muestra las preguntas de la pantalla en la que estás, con buscador, sin salir de ella. */
export function PanelAyuda({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const location = useLocation();
  const [texto, setTexto] = useState("");
  const [destacada, setDestacada] = useState<string | null>(null);
  const pestana = new URLSearchParams(location.search).get("pestana");
  const { titulo, preguntas } = contextoAyuda(location.pathname, pestana);
  const buscando = texto.trim().length >= 2;

  // Al cambiar de pantalla se limpia la búsqueda; Esc cierra el panel
  useEffect(() => { setTexto(""); setDestacada(null); }, [location.pathname, pestana]);
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, onCerrar]);

  const irA = (id: string) => {
    setTexto("");
    setDestacada(id);
    setTimeout(() => document.getElementById(`panel-ayuda-${id}`)?.scrollIntoView({ block: "start" }));
  };
  const extra = destacada && !preguntas.some((p) => p.id === destacada) ? preguntaPorId(destacada) : undefined;
  const lista = extra ? [extra, ...preguntas] : preguntas;

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 top-12 z-40" onClick={onCerrar}>
      <div className="absolute inset-0 bg-black/20 sm:bg-transparent" />
      <aside
        role="dialog" aria-modal="false" aria-labelledby="panel-ayuda-titulo"
        className="absolute bottom-0 right-0 top-0 flex w-full max-w-[440px] flex-col border-l border-stroke bg-surface text-fg shadow-flyout"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-stroke px-4 py-3">
          <LifeBuoy size={18} className="text-brand-fg" />
          <h2 id="panel-ayuda-titulo" className="flex-1 font-semibold">Ayuda <span className="font-normal text-muted">· {titulo}</span></h2>
          <button onClick={onCerrar} className="rounded p-1.5 hover:bg-subtle" aria-label="Cerrar la ayuda"><X size={18} /></button>
        </div>
        <div className="border-b border-stroke p-3">
          {/* En el móvil no se enfoca para que el teclado no tape las preguntas */}
          <CajaBusquedaAyuda valor={texto} onChange={setTexto} placeholder="Escribe tu duda…" autoFocus={matchMedia("(min-width: 640px)").matches} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {buscando ? <ResultadosAyuda texto={texto.trim()} alIrA={irA} max={4} /> : (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Preguntas sobre esta pantalla</p>
              {lista.map((p) => (
                <PreguntaPlegable key={p.id} id={`panel-ayuda-${p.id}`} p={p} abierta={destacada === p.id} alIrA={irA} />
              ))}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-stroke px-4 py-2.5 text-sm">
          <Link to="/ayuda" onClick={onCerrar} className="font-semibold text-brand-fg hover:underline">Ver toda la ayuda</Link>
          <a href="/manual-facturador.pdf" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-muted hover:text-fg"><BookOpen size={14} /> Manual PDF</a>
        </div>
      </aside>
    </div>
  );
}
