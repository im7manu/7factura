import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Clock, FilePlus2, FileText, ScrollText, Users } from "lucide-react";
import { api, type Avisos } from "@/lib/api";
import { ListaAvisos } from "@/components/Avisos";
import { useSesion } from "@/hooks/sesion";
import { EstadoBadge, Loading, Table, td, th } from "@/components/ui/misc";
import { cn, eur, fecha } from "@/lib/utils";

interface Suma { n: number; neto: number; iva: number; total: number }
interface Resumen {
  anio: number; trimestre: number; ejercicio: Suma; trimestre_actual: Suma; pendiente: Suma; vencidas: Suma;
  borradores: number; presupuestos_abiertos: number; clientes: number;
  meses: { mes: string; neto: number }[];
  ultimas: { id: number; codigo: string | null; fecha: string; estado: string; total: number; cliente_nombre: string | null }[];
}

/** Mosaico estilo Metro: bloque plano de color con icono, cifra y etiqueta. */
function Tile({ color, icon, label, value, detail, to, wide }: {
  color: string; icon: ReactNode; label: string; value?: ReactNode; detail?: ReactNode; to: string; wide?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-[var(--radio-mosaico)] p-4 text-white transition-transform",
        "hover:outline hover:outline-2 hover:outline-white/60 active:scale-[0.98]",
        wide && "sm:col-span-2",
        color,
      )}
    >
      <div className="flex items-start justify-between">
        <span className="opacity-90">{icon}</span>
        {detail ? <span className="text-right text-xs font-semibold opacity-90">{detail}</span> : null}
      </div>
      <div>
        {value !== undefined ? <div className="text-[26px] font-light leading-tight tnum">{value}</div> : null}
        <div className="text-sm font-semibold">{label}</div>
      </div>
    </Link>
  );
}

function nombreMes(m: string) {
  return new Date(`${m}-15`).toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
}

export default function Inicio() {
  const { usuario } = useSesion();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["resumen"], queryFn: () => api.get<Resumen>("/resumen") });
  const avisos = useQuery({ queryKey: ["avisos"], queryFn: () => api.get<Avisos>("/cobros/avisos") });
  if (!q.data) return <Loading />;
  const r = q.data;
  const h = new Date().getHours();
  const saludo = h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";

  // Últimos 12 meses, rellenando los meses sin facturas
  const meses: { mes: string; neto: number }[] = [];
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 11);
  for (let i = 0; i < 12; i++) {
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    meses.push({ mes: clave, neto: r.meses.find((m) => m.mes === clave)?.neto || 0 });
    d.setMonth(d.getMonth() + 1);
  }
  const max = Math.max(...meses.map((m) => m.neto), 1);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{saludo}, {usuario?.nombre.split(" ")[0]}</h1>
      <p className="mb-5 text-sm text-muted">Resumen de tu facturación · {r.trimestre}T {r.anio}</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile wide color="bg-tile-blue" to="/facturas" icon={<FileText size={28} />} label={`Facturado en ${r.anio} (base imponible)`}
          value={eur(r.ejercicio.neto)} detail={`${r.ejercicio.n} ${r.ejercicio.n === 1 ? "factura" : "facturas"}`} />
        <Tile color="bg-tile-teal" to="/informes" icon={<BarChart3 size={28} />} label={`${r.trimestre}º trimestre`}
          value={eur(r.trimestre_actual.neto)} detail={`IVA ${eur(r.trimestre_actual.iva)}`} />
        <Tile color="bg-tile-purple" to="/facturas/nueva" icon={<FilePlus2 size={28} />} label="Nueva factura" />
        <Tile color={r.vencidas.n ? "bg-tile-orange" : "bg-tile-slate"} to="/cobros"
          icon={r.vencidas.n ? <AlertTriangle size={28} /> : <Clock size={28} />} label="Pendiente de cobro"
          value={eur(r.pendiente.total)} detail={r.vencidas.n ? `${r.vencidas.n} ${r.vencidas.n === 1 ? "vencida" : "vencidas"}` : `${r.pendiente.n} ${r.pendiente.n === 1 ? "factura" : "facturas"}`} />
        <Tile color="bg-tile-green" to="/clientes" icon={<Users size={28} />} label="Clientes" value={r.clientes} />
        <Tile color="bg-tile-magenta" to="/presupuestos" icon={<ScrollText size={28} />} label="Presupuestos abiertos" value={r.presupuestos_abiertos} />
        <Tile color="bg-tile-slate" to="/facturas?estado=borrador" icon={<FileText size={28} />} label="Borradores" value={r.borradores} />
      </div>

      {avisos.data?.activos && avisos.data.en_inicio && (avisos.data.impagados.length || avisos.data.proximos.length) ? (
        <section className="card mt-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-stroke px-4 py-2">
            <h2 className="text-base font-semibold">Avisos de cobro</h2>
            <Link to="/cobros" className="text-sm font-semibold text-brand-fg hover:underline">Ir a cobros</Link>
          </div>
          <ListaAvisos avisos={avisos.data} max={5} />
        </section>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold">Base imponible por mes</h2>
          <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Gráfico de facturación de los últimos 12 meses">
            {meses.map((m) => (
              <div key={m.mes} className="group flex h-full flex-1 flex-col items-center gap-1">
                <div className="relative flex w-full flex-1 items-end">
                  <div className="w-full rounded-t-sm bg-brand-fg/80 transition-colors group-hover:bg-brand-fg" style={{ height: `${(m.neto / max) * 100}%`, minHeight: m.neto ? 2 : 0 }} />
                  <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-fg px-1.5 py-0.5 text-[11px] text-canvas group-hover:block">
                    {eur(m.neto)}
                  </span>
                </div>
                <span className="text-[11px] text-muted">{nombreMes(m.mes)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold">Últimas facturas</h2>
            <Link to="/facturas" className="text-sm font-semibold text-brand-fg hover:underline">Ver todas</Link>
          </div>
          <Table>
            <thead><tr><th className={th}>Número</th><th className={th}>Cliente</th><th className={th}>Fecha</th><th className={th}>Estado</th><th className={cn(th, "text-right")}>Total</th></tr></thead>
            <tbody>
              {r.ultimas.length === 0 ? (
                <tr><td className={cn(td, "py-8 text-center text-muted")} colSpan={5}>Aún no hay facturas.</td></tr>
              ) : r.ultimas.map((f) => (
                <tr key={f.id} className="cursor-pointer hover:bg-subtle" onClick={() => navigate(`/facturas/${f.id}`)}>
                  <td className={cn(td, "font-semibold")}>{f.codigo || "Borrador"}</td>
                  <td className={cn(td, "max-w-[200px] truncate")}>{f.cliente_nombre || "—"}</td>
                  <td className={td}>{fecha(f.fecha)}</td>
                  <td className={td}><EstadoBadge estado={f.estado} /></td>
                  <td className={cn(td, "text-right tnum")}>{eur(f.total)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      </div>
    </div>
  );
}
