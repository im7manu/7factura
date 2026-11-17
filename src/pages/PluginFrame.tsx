import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Loading } from "@/components/ui/misc";

interface Menu { id: string; nombre: string; entrada: string; menu: { titulo: string }[] }

/** Muestra la interfaz propia de un plugin dentro del marco de la aplicación. */
export default function PluginFrame() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["plugins-menu"], queryFn: () => api.get<Menu[]>("/plugins/menu") });
  if (q.isLoading) return <Loading />;
  const p = q.data?.find((x) => x.id === id);
  if (!p) return <p className="text-muted">Este plugin no está disponible.</p>;
  return (
    <div className="-mx-4 -my-5 h-[calc(100vh-48px)] sm:-mx-6">
      <iframe title={p.nombre} src={`/plugins/${p.id}/${p.entrada}`} className="h-full w-full border-0 bg-surface" />
    </div>
  );
}
