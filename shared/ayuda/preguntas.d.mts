export interface CategoriaAyuda { id: string; titulo: string; color: string; icono: string; desc: string }
export interface PreguntaAyuda {
  id: string; cat: string; q: string; a: string;
  ejemplos?: string[]; claves?: string; v?: "win" | "srv"; prioridad?: number;
}
export const AYUDA: { categorias: CategoriaAyuda[]; preguntas: PreguntaAyuda[] };
