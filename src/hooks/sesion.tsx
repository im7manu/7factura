import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Empresa, type Usuario } from "@/lib/api";

interface Estado { instalado: boolean; usuario: Usuario | null; empresa: Empresa | null; seguridad?: { recuperacion: boolean; passkeys: boolean } }
interface Ctx extends Estado { recargar: () => Promise<unknown>; salir: () => Promise<void> }

const SesionCtx = createContext<Ctx | null>(null);

export function SesionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["estado"], queryFn: () => api.get<Estado>("/estado"), staleTime: Infinity });

  useEffect(() => {
    const caducada = () => qc.invalidateQueries({ queryKey: ["estado"] });
    window.addEventListener("sesion-caducada", caducada);
    return () => window.removeEventListener("sesion-caducada", caducada);
  }, [qc]);

  if (!q.data) return <>{fallback}</>;
  const valor: Ctx = {
    ...q.data,
    recargar: () => q.refetch(),
    salir: async () => {
      await api.post("/logout");
      qc.clear();
      await q.refetch();
    },
  };
  return <SesionCtx.Provider value={valor}>{children}</SesionCtx.Provider>;
}

export function useSesion() {
  const c = useContext(SesionCtx);
  if (!c) throw new Error("useSesion fuera de SesionProvider");
  return c;
}
