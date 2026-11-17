import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { api, type Cliente } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CommandBar, Empty, Loading, PageHeader, Table, td, th } from "@/components/ui/misc";
import { ClienteDialog } from "@/components/ClienteDialog";
import { cn, eur } from "@/lib/utils";

export default function Clientes({ tipo = "cliente" }: { tipo?: "cliente" | "proveedor" }) {
  const prov = tipo === "proveedor";
  const ruta = prov ? "/proveedores" : "/clientes";
  const clave = prov ? "proveedores" : "clientes";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [abierto, setAbierto] = useState(false);
  const query = useQuery({ queryKey: [clave], queryFn: () => api.get<Cliente[]>(ruta) });
  const borrar = useMutation({
    mutationFn: (id: number) => api.del(`${ruta}/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [clave] }); toast.success(prov ? "Proveedor eliminado" : "Cliente eliminado"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const filtro = q.toLowerCase();
  const filas = (query.data || []).filter((c) => !filtro || c.nombre.toLowerCase().includes(filtro) || c.nif.toLowerCase().includes(filtro) || c.ciudad.toLowerCase().includes(filtro));

  return (
    <div>
      <PageHeader title={prov ? "Proveedores" : "Clientes"} subtitle={query.data ? `${query.data.length} ${prov ? "proveedores" : "clientes"}` : undefined}
        actions={<Button variant="primary" onClick={() => { setEditando(null); setAbierto(true); }}><Plus size={16} /> {prov ? "Nuevo proveedor" : "Nuevo cliente"}</Button>} />
      <CommandBar>
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-2.5 top-2 text-muted" />
          <Input placeholder="Buscar por nombre, NIF o ciudad" value={q} onChange={(e) => setQ(e.target.value)} className="border-transparent pl-8" />
        </div>
      </CommandBar>
      {query.isLoading ? <Loading /> : filas.length === 0 ? (
        <div className="card"><Empty icon={<Users size={40} />} title={q ? "No hay resultados" : prov ? "Aún no hay proveedores" : "Aún no hay clientes"}>{q ? "Prueba con otra búsqueda." : prov ? "Añade tus proveedores para registrar sus facturas." : "Añade tu primer cliente para empezar a facturar."}</Empty></div>
      ) : (
        <Table>
          <thead><tr>
            <th className={th}>Nombre</th><th className={th}>NIF</th><th className={cn(th, "hidden md:table-cell")}>Ciudad</th>
            <th className={cn(th, "hidden lg:table-cell")}>Contacto</th><th className={cn(th, "text-right")}>Facturas</th>
            <th className={cn(th, "text-right")}>Pendiente</th><th className={th} />
          </tr></thead>
          <tbody>
            {filas.map((c) => (
              <tr key={c.id} className="hover:bg-subtle">
                <td className={cn(td, "font-semibold")}>{c.nombre}</td>
                <td className={cn(td, "tnum")}>{c.nif || <span className="text-warning">Sin NIF</span>}</td>
                <td className={cn(td, "hidden md:table-cell")}>{[c.ciudad, c.provincia].filter(Boolean).join(", ")}</td>
                <td className={cn(td, "hidden text-muted lg:table-cell")}>{c.email || c.telefono}</td>
                <td className={cn(td, "text-right tnum")}>{c.num_facturas}</td>
                <td className={cn(td, "text-right tnum", c.pendiente ? "font-semibold" : "text-muted")}>{eur(c.pendiente)}</td>
                <td className={cn(td, "whitespace-nowrap text-right")}>
                  <Button size="icon" variant="subtle" title="Ver facturas" aria-label="Ver facturas" onClick={() => navigate(`${prov ? "/compras/facturas" : "/facturas"}?q=${encodeURIComponent(c.nif || c.nombre)}`)}><FileText size={16} /></Button>
                  <Button size="icon" variant="subtle" title="Editar" aria-label="Editar" onClick={() => { setEditando(c); setAbierto(true); }}><Pencil size={16} /></Button>
                  <Button size="icon" variant="subtle" title="Eliminar" aria-label="Eliminar" disabled={!!c.num_facturas}
                    onClick={() => confirm(`¿Eliminar ${c.nombre}?`) && borrar.mutate(c.id)}><Trash2 size={16} /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ClienteDialog open={abierto} onOpenChange={setAbierto} cliente={editando} tipo={tipo} />
    </div>
  );
}
