import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { aplicarTema, type Apariencia } from "@/lib/tema";

/** Tema y fotos de inicio de sesión definidos por el administrador (plugin «Temas»). */
export function useApariencia() {
  const q = useQuery({ queryKey: ["apariencia"], queryFn: () => api.get<Apariencia>("/apariencia"), staleTime: 5 * 60 * 1000 });
  useEffect(() => { if (q.isSuccess) aplicarTema(q.data.tema); }, [q.isSuccess, q.data]);
  return q.data || { tema: null, fondos: [] };
}
