import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { api, type FilaDesglose } from "@/lib/api";
import { Select } from "@/components/ui/input";
import { Loading, PageHeader, Table, td, th } from "@/components/ui/misc";
import { cn, eur, num, OPERACIONES } from "@/lib/utils";

interface Bloque { n: number; neto: number; iva: number; recargo: number; irpf: number; suplidos: number; total: number; porTipo: FilaDesglose[] }
interface Trimestre extends Bloque { trimestre: number; soportado: Bloque; resultado: number }
interface Fila347 { nombre: string; nif: string; total: number; t1: number; t2: number; t3: number; t4: number }
interface Informe {
  anio: number; trimestres: Trimestre[];
  m347: (Fila347 & { cliente_id: number })[];
  m347prov: (Fila347 & { proveedor_id: number })[];
  vehiculos: { id: number; matricula: string; tipo: string; modelo: string; base: number; documentos: number }[];
}

export default function Informes() {
  const actual = new Date().getFullYear();
  const [anio, setAnio] = useState(actual);
  const q = useQuery({ queryKey: ["informe", anio], queryFn: () => api.get<Informe>(`/informes/ejercicio/${anio}`) });
  const r = q.data;
  const tot = r?.trimestres.reduce((s, t) => ({ n: s.n + t.n, neto: s.neto + t.neto, iva: s.iva + t.iva, irpf: s.irpf + t.irpf, total: s.total + t.total }), { n: 0, neto: 0, iva: 0, irpf: 0, total: 0 });

  return (
    <div>
      <PageHeader title="Informes" subtitle="Datos de ventas y compras para tus declaraciones"
        actions={<Select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="w-28" aria-label="Ejercicio">
          {[0, 1, 2, 3].map((i) => <option key={i} value={actual - i}>{actual - i}</option>)}
        </Select>} />

      <div className="mb-4 flex gap-2 rounded bg-brand-soft p-3 text-sm">
        <Info size={18} className="mt-0.5 shrink-0 text-brand-fg" />
        <p>El IVA soportado sale de las <strong>facturas recibidas y gastos marcados como deducibles</strong>. Son datos de referencia: revisa siempre las cifras con tu gestoría antes de presentar.</p>
      </div>

      {!r || !tot ? <Loading /> : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-base font-semibold">Resumen del IVA por trimestre (referencia para el modelo 303)</h2>
            <div className="mb-4 grid gap-2 sm:grid-cols-4">
              {r.trimestres.map((t) => (
                <div key={t.trimestre} className={cn("p-3 text-white", t.resultado > 0 ? "bg-tile-orange" : "bg-tile-green")}>
                  <p className="text-xs font-semibold opacity-90">{t.trimestre}º trimestre</p>
                  <p className="text-xl font-light tnum">{eur(Math.abs(t.resultado))}</p>
                  <p className="text-xs font-semibold">{t.resultado > 0 ? "A ingresar" : t.resultado < 0 ? "A compensar / devolver" : "Sin resultado"}</p>
                  <p className="mt-1 text-[11px] opacity-90">Repercutido {eur(t.iva + t.recargo)} · Soportado {eur(t.soportado.iva)}</p>
                </div>
              ))}
            </div>
            <h3 className="mb-2 text-sm font-semibold text-muted">IVA repercutido (ventas)</h3>
            <Table>
              <thead><tr>
                <th className={th}>Trimestre</th><th className={cn(th, "text-right")}>Facturas</th><th className={th}>Desglose por tipo</th>
                <th className={cn(th, "text-right")}>Base imponible</th><th className={cn(th, "text-right")}>Cuota IVA</th>
                <th className={cn(th, "text-right")}>IRPF retenido</th><th className={cn(th, "text-right")}>Total</th>
              </tr></thead>
              <tbody>
                {r.trimestres.map((t) => (
                  <tr key={t.trimestre}>
                    <td className={cn(td, "font-semibold")}>{t.trimestre}T</td>
                    <td className={cn(td, "text-right tnum")}>{t.n}</td>
                    <td className={cn(td, "text-xs text-muted")}>{t.porTipo.map((p) => OPERACIONES[p.operacion].conIva
                      ? `IVA ${num(p.tipo)} %: ${eur(p.base)} → ${eur(p.cuota)}${p.cuotaRecargo ? ` + R.E. ${eur(p.cuotaRecargo)}` : ""}`
                      : `${OPERACIONES[p.operacion].corto}: ${eur(p.base)}`).join(" · ") || "—"}</td>
                    <td className={cn(td, "text-right tnum")}>{eur(t.neto)}</td>
                    <td className={cn(td, "text-right tnum")}>{eur(t.iva)}</td>
                    <td className={cn(td, "text-right tnum")}>{eur(t.irpf)}</td>
                    <td className={cn(td, "text-right font-semibold tnum")}>{eur(t.total)}</td>
                  </tr>
                ))}
                <tr className="bg-subtle font-semibold">
                  <td className={td}>Año {r.anio}</td><td className={cn(td, "text-right tnum")}>{tot.n}</td><td className={td} />
                  <td className={cn(td, "text-right tnum")}>{eur(tot.neto)}</td><td className={cn(td, "text-right tnum")}>{eur(tot.iva)}</td>
                  <td className={cn(td, "text-right tnum")}>{eur(tot.irpf)}</td><td className={cn(td, "text-right tnum")}>{eur(tot.total)}</td>
                </tr>
              </tbody>
            </Table>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-muted">IVA soportado deducible (compras y gastos)</h3>
            <Table>
              <thead><tr>
                <th className={th}>Trimestre</th><th className={cn(th, "text-right")}>Documentos</th><th className={th}>Desglose por tipo</th>
                <th className={cn(th, "text-right")}>Base imponible</th><th className={cn(th, "text-right")}>Cuota soportada</th><th className={cn(th, "text-right")}>Total</th>
              </tr></thead>
              <tbody>
                {r.trimestres.map((t) => (
                  <tr key={t.trimestre}>
                    <td className={cn(td, "font-semibold")}>{t.trimestre}T</td>
                    <td className={cn(td, "text-right tnum")}>{t.soportado.n}</td>
                    <td className={cn(td, "text-xs text-muted")}>{t.soportado.porTipo.map((p) => OPERACIONES[p.operacion].conIva ? `IVA ${num(p.tipo)} %: ${eur(p.base)} → ${eur(p.cuota)}` : `${OPERACIONES[p.operacion].corto}: ${eur(p.base)}`).join(" · ") || "—"}</td>
                    <td className={cn(td, "text-right tnum")}>{eur(t.soportado.neto)}</td>
                    <td className={cn(td, "text-right tnum")}>{eur(t.soportado.iva)}</td>
                    <td className={cn(td, "text-right font-semibold tnum")}>{eur(t.soportado.total)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold">Clientes por encima de 3.005,06 € (referencia para el modelo 347)</h2>
            <p className="mb-2 text-sm text-muted">Importe total facturado con IVA, por trimestres.</p>
            <Table>
              <thead><tr>
                <th className={th}>Cliente</th><th className={th}>NIF</th>
                {["1T", "2T", "3T", "4T"].map((x) => <th key={x} className={cn(th, "hidden text-right md:table-cell")}>{x}</th>)}
                <th className={cn(th, "text-right")}>Total anual</th>
              </tr></thead>
              <tbody>
                {r.m347.length === 0 ? (
                  <tr><td className={cn(td, "py-6 text-center text-muted")} colSpan={7}>Ningún cliente supera el umbral en {r.anio}.</td></tr>
                ) : r.m347.map((c) => (
                  <tr key={c.cliente_id}>
                    <td className={cn(td, "font-semibold")}>{c.nombre}</td><td className={cn(td, "tnum")}>{c.nif}</td>
                    {[c.t1, c.t2, c.t3, c.t4].map((v, i) => <td key={i} className={cn(td, "hidden text-right tnum md:table-cell")}>{eur(v)}</td>)}
                    <td className={cn(td, "text-right font-semibold tnum")}>{eur(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
          <section>
            <h2 className="mb-1 text-base font-semibold">Proveedores por encima de 3.005,06 € (modelo 347, compras)</h2>
            <Table>
              <thead><tr>
                <th className={th}>Proveedor</th><th className={th}>NIF</th>
                {["1T", "2T", "3T", "4T"].map((x) => <th key={x} className={cn(th, "hidden text-right md:table-cell")}>{x}</th>)}
                <th className={cn(th, "text-right")}>Total anual</th>
              </tr></thead>
              <tbody>
                {r.m347prov.length === 0 ? (
                  <tr><td className={cn(td, "py-6 text-center text-muted")} colSpan={7}>Ningún proveedor supera el umbral en {r.anio}.</td></tr>
                ) : r.m347prov.map((c) => (
                  <tr key={c.proveedor_id}>
                    <td className={cn(td, "font-semibold")}>{c.nombre}</td><td className={cn(td, "tnum")}>{c.nif}</td>
                    {[c.t1, c.t2, c.t3, c.t4].map((v, i) => <td key={i} className={cn(td, "hidden text-right tnum md:table-cell")}>{eur(v)}</td>)}
                    <td className={cn(td, "text-right font-semibold tnum")}>{eur(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>

          {r.vehiculos.length ? (
            <section>
              <h2 className="mb-1 text-base font-semibold">Gasto por vehículo en {r.anio}</h2>
              <p className="mb-2 text-sm text-muted">Base imponible de las líneas de compras y gastos asignadas a cada vehículo.</p>
              <Table>
                <thead><tr><th className={th}>Matrícula</th><th className={th}>Tipo</th><th className={cn(th, "hidden md:table-cell")}>Modelo</th><th className={cn(th, "text-right")}>Documentos</th><th className={cn(th, "text-right")}>Gasto</th></tr></thead>
                <tbody>
                  {r.vehiculos.map((v) => (
                    <tr key={v.id}>
                      <td className={cn(td, "font-semibold tnum")}>{v.matricula}</td><td className={td}>{v.tipo}</td>
                      <td className={cn(td, "hidden md:table-cell")}>{v.modelo || "—"}</td>
                      <td className={cn(td, "text-right tnum")}>{v.documentos}</td><td className={cn(td, "text-right font-semibold tnum")}>{eur(v.base)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
