import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/ui/misc";
import { CajaBusquedaAyuda, PreguntaPlegable, ResultadosAyuda, WEB_AYUDA, categorias, preguntas } from "@/components/ayuda";

/** Centro de ayuda: las mismas preguntas y el mismo buscador que la web. Enlace directo a una pregunta: /ayuda#id. */
export default function Ayuda() {
  const location = useLocation();
  const navigate = useNavigate();
  const [texto, setTexto] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const buscando = texto.trim().length >= 2;

  const irA = (id: string) => {
    setTexto("");
    setAbierta(id);
    navigate({ hash: id }, { replace: true });
  };

  // Abre la pregunta del enlace (#id) y la lleva a la vista
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) setAbierta(id);
  }, [location.hash]);
  useEffect(() => {
    if (!abierta || buscando) return;
    const el = document.getElementById(`ayuda-${abierta}`) as HTMLDetailsElement | null;
    if (el) { el.open = true; el.scrollIntoView({ block: "start" }); }
  }, [abierta, buscando]);

  return (
    <div>
      <PageHeader title="Ayuda" subtitle="Escribe tu duda con tus palabras: te recomendaremos la respuesta aunque no uses las mismas palabras." />
      <CajaBusquedaAyuda valor={texto} onChange={setTexto} autoFocus className="mb-5 max-w-3xl" />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className={buscando ? "hidden lg:block" : ""} aria-label="Categorías de la ayuda">
          <div className="lg:sticky lg:top-0">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Categorías</p>
            <ul className="flex flex-wrap gap-1.5 lg:block lg:space-y-0.5">
              {categorias.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { setTexto(""); setTimeout(() => document.getElementById(`cat-${c.id}`)?.scrollIntoView({ block: "start" })); }}
                    className="rounded border border-stroke px-2 py-1 text-left text-sm hover:bg-subtle hover:text-brand-fg lg:w-full lg:border-0">
                    {c.titulo}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1 text-sm">
              <a href="/manual-facturador.pdf" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-brand-fg hover:underline"><BookOpen size={14} /> Manual en PDF</a>
              <a href={`${WEB_AYUDA}ayuda.html`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-brand-fg hover:underline"><ExternalLink size={14} /> Ayuda en la web</a>
            </div>
          </div>
        </nav>

        <div className="min-w-0">
          {buscando ? <ResultadosAyuda texto={texto.trim()} alIrA={irA} /> : (
            <>
              {categorias.map((c) => (
                <section key={c.id} id={`cat-${c.id}`} className="mb-8 scroll-mt-4" aria-labelledby={`t-${c.id}`}>
                  <h2 id={`t-${c.id}`} className="mb-1 flex items-center gap-2.5 text-lg font-semibold">
                    <span className="grid h-8 w-8 place-items-center rounded text-white" style={{ background: c.color }} aria-hidden>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={c.icono} /></svg>
                    </span>
                    {c.titulo}
                  </h2>
                  <p className="mb-3 text-sm text-muted">{c.desc}</p>
                  {preguntas.filter((p) => p.cat === c.id).map((p) => (
                    <PreguntaPlegable key={p.id} id={`ayuda-${p.id}`} p={p} abierta={abierta === p.id} alIrA={irA} />
                  ))}
                </section>
              ))}
              <p className="text-sm text-muted">
                {preguntas.length} preguntas · ¿No encuentras lo que buscas?{" "}
                <a className="text-brand-fg underline" href="https://github.com/im7manu/facturador/issues" target="_blank" rel="noreferrer">Pregunta en GitHub</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
