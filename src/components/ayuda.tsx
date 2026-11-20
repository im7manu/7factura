// Piezas del centro de ayuda dentro de la aplicación. Las preguntas y el buscador son los mismos que los de la web
// (shared/ayuda/): si se añade una pregunta, aparece en los dos sitios. Funciona sin conexión.
import { useEffect, useMemo, useRef, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, Lightbulb, Search, X } from "lucide-react";
import { AYUDA, type PreguntaAyuda } from "@shared/ayuda/preguntas.mjs";
import { crearBuscador, normalizar, raiz, resaltar, seleccionar, type ResultadoAyuda } from "@shared/ayuda/buscador.mjs";
import { cn } from "@/lib/utils";

export const { categorias, preguntas } = AYUDA;
export const WEB_AYUDA = "https://im7manu.github.io/7factura/";
const buscar = crearBuscador(preguntas);
const porId = new Map(preguntas.map((p) => [p.id, p]));
const catPorId = new Map(categorias.map((c) => [c.id, c]));
export const preguntaPorId = (id: string) => porId.get(id);
export const enlaceIncidencia = (q: string) => `https://github.com/im7manu/7factura/issues/new?title=${encodeURIComponent(q || "Duda")}`;

/** Adapta las rutas de las respuestas (pensadas para la web) a la aplicación. */
function adaptarHtml(html: string) {
  return html
    .replace(/src="capturas\//g, 'src="/capturas-manual/')
    .replace(/href="(privacidad|aviso-legal)\.html"/g, `href="${WEB_AYUDA}$1.html"`)
    .replace(/href="manual-facturador\.pdf"/g, 'href="/manual-facturador.pdf"')
    .replace(/<a href="(https?:[^"]+|\/manual-facturador\.pdf)"/g, '<a href="$1" target="_blank" rel="noreferrer"');
}

/** Texto con las palabras que han coincidido marcadas. */
export function Resaltado({ texto, coincidencias }: { texto: string; coincidencias?: Set<string> }) {
  if (!coincidencias?.size) return <>{texto}</>;
  return <>{texto.split(/([\p{L}\d*]+)/u).map((w, i) => (w.length > 2 && coincidencias.has(raiz(normalizar(w))) ? <mark key={i}>{w}</mark> : w))}</>;
}

function Chips({ p }: { p: PreguntaAyuda }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-sin-resaltar>
      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-brand-fg">{catPorId.get(p.cat)?.titulo}</span>
      {p.v === "win" ? <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-muted">Solo versión Windows</span> : null}
      {p.v === "srv" ? <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-muted">Solo versión servidor</span> : null}
    </div>
  );
}

/** Respuesta de una pregunta. Los enlaces a otras preguntas (#id) llaman a alIrA. */
export function RespuestaAyuda({ p, coincidencias, alIrA }: { p: PreguntaAyuda; coincidencias?: Set<string>; alIrA: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => adaptarHtml(p.a), [p.a]);
  const clave = coincidencias ? [...coincidencias].sort().join(" ") : "";
  useEffect(() => { if (ref.current && coincidencias) resaltar(ref.current, coincidencias); }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  const pulsar = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href") || "";
    if (href.startsWith("#") && porId.has(href.slice(1))) { e.preventDefault(); alIrA(href.slice(1)); }
  };
  return (
    <div className="ayuda-respuesta" onClick={pulsar}>
      {/* key: al cambiar lo resaltado se vuelve a pintar desde cero */}
      <div key={clave} ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
      <Chips p={p} />
    </div>
  );
}

export function PreguntaPlegable({ p, abierta, coincidencias, alIrA, id }: {
  p: PreguntaAyuda; abierta?: boolean; coincidencias?: Set<string>; alIrA: (id: string) => void; id?: string;
}) {
  return (
    <details id={id} open={abierta} className="card group mb-2 scroll-mt-4 open:shadow-flyout">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold hover:text-brand-fg [&::-webkit-details-marker]:hidden">
        <span><Resaltado texto={p.q} coincidencias={coincidencias} /></span>
        <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-4 pb-4"><RespuestaAyuda p={p} coincidencias={coincidencias} alIrA={alIrA} /></div>
    </details>
  );
}

export function CajaBusquedaAyuda({ valor, onChange, autoFocus, className, placeholder }: {
  valor: string; onChange: (v: string) => void; autoFocus?: boolean; className?: string; placeholder?: string;
}) {
  return (
    <div className={cn("relative", className)} role="search">
      <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search" value={valor} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} autoComplete="off" spellCheck
        placeholder={placeholder || "Escribe tu duda, por ejemplo: me he equivocado en una factura"} aria-label="Buscar en la ayuda"
        className="h-11 w-full rounded-md border border-stroke bg-surface pl-10 pr-10 text-[15px] outline-none focus:border-brand-fg [&::-webkit-search-cancel-button]:hidden"
      />
      {valor ? (
        <button type="button" onClick={() => onChange("")} aria-label="Borrar la búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-subtle">
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}

/** Resultados de una búsqueda: la respuesta recomendada (si destaca) y las relacionadas. */
export function ResultadosAyuda({ texto, alIrA, max = 6, pie }: { texto: string; alIrA: (id: string) => void; max?: number; pie?: ReactNode }) {
  const res = useMemo<ResultadoAyuda[]>(() => buscar(texto, true), [texto]);
  const { recomendada, relacionadas } = seleccionar(res, max);
  const coinc = useMemo(() => new Set(res.slice(0, 8).flatMap((r) => [...r.coincidencias])), [res]);
  if (!recomendada && !relacionadas.length) {
    return (
      <div className="rounded-md border border-dashed border-stroke p-5" role="status">
        <p className="font-semibold">No hemos encontrado nada sobre «{texto}»</p>
        <p className="mt-1 text-sm text-muted">Prueba con otras palabras, por ejemplo «cobrar una factura» o «copia de seguridad».</p>
        <p className="mt-2 text-sm">
          Si sigues con la duda, <a className="text-brand-fg underline" href={enlaceIncidencia(texto)} target="_blank" rel="noreferrer">pregúntalo en GitHub</a> o
          consulta el <a className="text-brand-fg underline" href="/manual-facturador.pdf" target="_blank" rel="noreferrer">manual en PDF</a>.
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-3 text-sm text-muted" role="status">
        {(recomendada ? 1 : 0) + relacionadas.length} {(recomendada ? 1 : 0) + relacionadas.length === 1 ? "respuesta" : "respuestas"} para «{texto}»
      </p>
      {recomendada ? (
        <article className="card mb-4 overflow-hidden border-2 border-brand-fg">
          <div className="flex items-center gap-2 bg-brand px-4 py-2 text-sm font-semibold text-brand-on">
            <Lightbulb size={16} /> Creemos que esto es lo que buscas
          </div>
          <div className="p-4">
            <h3 className="mb-2 text-lg font-semibold"><Resaltado texto={recomendada.p.q} coincidencias={coinc} /></h3>
            <RespuestaAyuda p={recomendada.p} coincidencias={coinc} alIrA={alIrA} />
            <p className="mt-3 text-xs text-muted">
              ¿No era esto? Mira las preguntas relacionadas o <a className="text-brand-fg underline" href={enlaceIncidencia(texto)} target="_blank" rel="noreferrer">pregúntalo en GitHub</a>.
            </p>
          </div>
        </article>
      ) : null}
      {relacionadas.length ? (
        <>
          <h3 className="mb-2 text-sm font-semibold text-muted">{recomendada ? "También puede ayudarte" : "Estas preguntas pueden resolver tu duda"}</h3>
          {relacionadas.map((r, i) => <PreguntaPlegable key={r.p.id} p={r.p} abierta={!recomendada && i === 0} coincidencias={coinc} alIrA={alIrA} />)}
        </>
      ) : null}
      {pie}
    </div>
  );
}

// ---------- Ayuda contextual ----------
// Qué preguntas enseñar según la pantalla. «ids» van primero; después, las de las categorías.
const CONTEXTOS: { prueba: (ruta: string, pestana: string | null) => boolean; titulo: string; ids?: string[]; cats?: string[] }[] = [
  { prueba: (r) => r === "/", titulo: "Inicio", ids: ["pantalla-inicio", "crear-factura", "quien-me-debe", "hacer-copia"], cats: ["empezar"] },
  { prueba: (r) => r.startsWith("/facturas"), titulo: "Facturas", ids: ["crear-factura", "corregir-factura", "enviar-correo", "apuntar-cobro"], cats: ["facturas"] },
  { prueba: (r) => r.startsWith("/presupuestos"), titulo: "Presupuestos", ids: ["presupuesto"], cats: ["documentos"] },
  { prueba: (r) => r.startsWith("/proformas"), titulo: "Proformas", ids: ["proforma"], cats: ["documentos"] },
  { prueba: (r) => r.startsWith("/pedidos"), titulo: "Pedidos", ids: ["pedidos"], cats: ["documentos"] },
  { prueba: (r) => r.startsWith("/albaranes"), titulo: "Albaranes", ids: ["albaran", "facturar-mes"], cats: ["documentos"] },
  { prueba: (r) => r.startsWith("/cobros"), titulo: "Cobros", cats: ["cobros"] },
  { prueba: (r) => r.startsWith("/pagos"), titulo: "Pagos", ids: ["pagos-proveedores"], cats: ["compras"] },
  { prueba: (r) => r.startsWith("/compras/gastos"), titulo: "Gastos y tickets", ids: ["gastos-tickets", "iva-deducible", "vehiculos"], cats: ["compras"] },
  { prueba: (r) => r.startsWith("/compras"), titulo: "Compras", ids: ["factura-proveedor", "iva-deducible"], cats: ["compras"] },
  { prueba: (r) => r.startsWith("/clientes") || r.startsWith("/proveedores"), titulo: "Clientes y proveedores", ids: ["nuevo-cliente", "vencimientos", "recargo", "intracomunitaria"], cats: ["clientes"] },
  { prueba: (r) => r.startsWith("/productos"), titulo: "Productos", ids: ["productos"], cats: ["clientes"] },
  { prueba: (r) => r.startsWith("/vehiculos"), titulo: "Vehículos", ids: ["vehiculos", "gastos-tickets"], cats: ["clientes"] },
  { prueba: (r) => r.startsWith("/informes"), titulo: "Informes", ids: ["modelo-303", "modelo-347"], cats: ["impuestos"] },
  { prueba: (r, p) => r.startsWith("/ajustes") && p === "series", titulo: "Series y formas de pago", ids: ["numeracion", "factura-simplificada", "vencimientos"], cats: ["facturas"] },
  { prueba: (r, p) => r.startsWith("/ajustes") && p === "ventas", titulo: "Ajustes de ventas", ids: ["pedidos", "albaran", "facturar-mes"], cats: ["documentos"] },
  { prueba: (r, p) => r.startsWith("/ajustes") && p === "compras", titulo: "Ajustes de compras", ids: ["iva-deducible", "gastos-tickets", "vehiculos"], cats: ["compras"] },
  { prueba: (r, p) => r.startsWith("/ajustes") && p === "cobros", titulo: "Ajustes de cobros", ids: ["vencimientos", "avisos-cobro"], cats: ["cobros"] },
  { prueba: (r, p) => r.startsWith("/ajustes") && p === "correo", titulo: "Correo", cats: ["correo"] },
  { prueba: (r, p) => r.startsWith("/ajustes") && p === "usuarios", titulo: "Usuarios", cats: ["usuarios"] },
  { prueba: (r, p) => r.startsWith("/ajustes") && p === "actualizaciones", titulo: "Actualizaciones", cats: ["actualizaciones"] },
  { prueba: (r, p) => r.startsWith("/ajustes") && p === "actividad", titulo: "Actividad", ids: ["seguridad"], cats: ["usuarios"] },
  { prueba: (r) => r.startsWith("/ajustes"), titulo: "Mi empresa", ids: ["primera-configuracion", "logo-pdf", "numeracion"], cats: ["empezar"] },
  { prueba: (r) => r.startsWith("/plugins") || r.startsWith("/p/"), titulo: "Plugins", ids: ["plugins", "hacer-copia", "logo-pdf", "firma-digital", "temas"], cats: ["copias"] },
];

/** Preguntas relacionadas con la pantalla actual (las más útiles primero). */
export function contextoAyuda(ruta: string, pestana: string | null): { titulo: string; preguntas: PreguntaAyuda[] } {
  const c = CONTEXTOS.find((x) => x.prueba(ruta, pestana)) || { titulo: "7Factura", ids: ["crear-factura", "hacer-copia"], cats: ["empezar"] };
  const ids = [...(c.ids || []), ...preguntas.filter((p) => c.cats?.includes(p.cat)).map((p) => p.id)];
  return { titulo: c.titulo, preguntas: [...new Set(ids)].map((id) => porId.get(id)).filter((p): p is PreguntaAyuda => !!p).slice(0, 10) };
}
