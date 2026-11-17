// Aplica el tema visual activo (lo define el plugin «Temas»; sin plugin se usa Metro, el diseño por defecto).
export type Colores = Partial<Record<
  "canvas" | "surface" | "subtle" | "stroke" | "fg" | "muted" | "brand" | "brand-hover" | "brand-fg" | "brand-soft" |
  "suite" | "suite-fg" | "brand-on" | "danger" | "success" | "warning", string>>;

export interface Tema {
  id: string; nombre: string; descripcion?: string; autor?: string;
  claro: Colores; oscuro?: Colores | null;
  modo?: "auto" | "claro" | "oscuro";      // «claro»/«oscuro» fijan el modo y ocultan el botón
  fuente?: string;                          // font-family CSS
  fuente_url?: string;                      // hoja de estilos con @font-face (servida por el plugin)
  radio?: number;                           // px
  sombra?: "ninguna" | "suave" | "marcada";
  cristal?: boolean;                        // superficies translúcidas con desenfoque
  relieve?: boolean;                        // bordes en 3D estilo escritorio clásico
  bordes?: boolean;                         // borde visible en todas las tarjetas
  menu?: "lateral" | "superior";
  iconos?: { trazo?: number };
  densidad?: "normal" | "compacta";
  fondo_app?: string;                       // CSS background-image (degradados o url)
  mosaicos?: Partial<Record<"blue" | "teal" | "purple" | "orange" | "green" | "magenta" | "slate", string>>;
}

export interface Apariencia { tema: Tema | null; fondos: string[]; intervalo?: number; texto_login?: string }

const SOMBRAS = {
  ninguna: ["none", "0 0 0 1px rgb(0 0 0 / 0.12)"],
  suave: ["0 1px 2px rgb(0 0 0 / 0.08), 0 0 2px rgb(0 0 0 / 0.06)", "0 8px 16px rgb(0 0 0 / 0.14), 0 0 2px rgb(0 0 0 / 0.12)"],
  marcada: ["0 4px 12px rgb(0 0 0 / 0.16), 0 1px 3px rgb(0 0 0 / 0.12)", "0 16px 32px rgb(0 0 0 / 0.22), 0 2px 6px rgb(0 0 0 / 0.14)"],
};

/** #RRGGBB → "R G B" (formato que usan las variables con opacidad de Tailwind). */
function rgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : null;
}
const bloque = (c: Colores = {}) =>
  Object.entries(c).map(([k, v]) => (v && rgb(v) ? `--${k}: ${rgb(v)};` : "")).join(" ");
const limpio = (v: string) => v.replace(/[;{}<>]/g, ""); // evita inyectar reglas CSS desde un tema

export function aplicarTema(t: Tema | null) {
  const raiz = document.documentElement;
  let estilo = document.getElementById("tema-activo") as HTMLStyleElement | null;
  if (!estilo) { estilo = document.createElement("style"); estilo.id = "tema-activo"; document.head.appendChild(estilo); }
  for (const k of ["cristal", "relieve", "bordes", "menu", "densidad", "modo-fijo"]) raiz.removeAttribute(`data-${k}`);
  if (!t) { estilo.textContent = ""; return; }

  const [sc, sf] = SOMBRAS[t.sombra || "suave"];
  const extra = [
    t.fuente ? `--fuente: ${limpio(t.fuente)};` : "",
    t.radio != null ? `--radio: ${Math.max(0, Math.min(28, Number(t.radio)))}px;` : "",
    // Los mosaicos solo se redondean en temas claramente redondeados (Metro los mantiene cuadrados)
    t.radio != null ? `--radio-mosaico: ${Number(t.radio) >= 8 ? Math.min(28, Number(t.radio)) : 0}px;` : "",
    `--sombra-card: ${sc}; --sombra-flyout: ${sf};`,
    t.iconos?.trazo ? `--trazo-iconos: ${Math.max(0.75, Math.min(3, Number(t.iconos.trazo)))};` : "",
    t.fondo_app ? `--fondo-app: ${limpio(t.fondo_app)};` : "",
    ...Object.entries(t.mosaicos || {}).map(([k, v]) => (v && rgb(v) ? `--tile-${k}: ${v};` : "")),
  ].join(" ");
  const oscuro = t.oscuro ? bloque(t.oscuro) : "";
  estilo.textContent = [
    t.fuente_url ? `@import url("${limpio(t.fuente_url).replace(/"/g, "")}");` : "",
    `:root { ${bloque(t.claro)} ${extra} }`,
    oscuro ? `@media (prefers-color-scheme: dark) { :root:not(.light) { ${oscuro} color-scheme: dark; } } :root.dark { ${oscuro} color-scheme: dark; }` : "",
  ].join("\n");

  if (t.cristal) raiz.dataset.cristal = "si";
  if (t.relieve) raiz.dataset.relieve = "si";
  if (t.bordes) raiz.dataset.bordes = "si";
  if (t.menu === "superior") raiz.dataset.menu = "superior";
  if (t.densidad === "compacta") raiz.dataset.densidad = "compacta";
  // Modo fijado por el tema (o tema sin variante oscura): se ignora la preferencia del usuario
  const modo = t.modo && t.modo !== "auto" ? t.modo : !t.oscuro ? "claro" : "auto";
  if (modo !== "auto") {
    raiz.classList.remove("light", "dark");
    raiz.classList.add(modo === "oscuro" ? "dark" : "light");
    raiz.dataset.modoFijo = "si";
  }
}
