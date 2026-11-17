import type { PreguntaAyuda } from "./preguntas.mjs";

export interface ResultadoAyuda { p: PreguntaAyuda; puntos: number; coincidencias: Set<string>; cobertura: number }
export function raiz(palabra: string): string;
export function normalizar(texto: string): string;
export function crearBuscador(preguntas: PreguntaAyuda[]): (texto: string, ultimaIncompleta?: boolean) => ResultadoAyuda[];
export function resaltar(elemento: Element, coincidencias: Set<string>): void;
export function seleccionar(resultados: ResultadoAyuda[], max?: number): { recomendada: ResultadoAyuda | null; relacionadas: ResultadoAyuda[] };
