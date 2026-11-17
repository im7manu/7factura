import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { api, type Ajustes as TAjustes, type AjustesCobros, type AjustesCompras, type AjustesVentas, type Empresa, type Plazo, type Usuario } from "@/lib/api";
import { useSesion } from "@/hooks/sesion";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Loading, PageHeader, Table, td, th } from "@/components/ui/misc";
import { EmpresaForm, EMPRESA_VACIA } from "@/components/EmpresaForm";
import { PlazosEditor } from "@/components/PlazosEditor";
import { PestanaCorreo } from "./AjustesCorreo";
import { PestanaActualizaciones } from "./AjustesActualizaciones";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";

type Pestana = "empresa" | "series" | "ventas" | "compras" | "cobros" | "correo" | "usuarios" | "actualizaciones" | "actividad";

export default function Ajustes() {
  const { usuario } = useSesion();
  const admin = usuario?.rol === "admin";
  const [params, setParams] = useSearchParams();
  const [pestana, setPestanaEstado] = useState<Pestana>(() => (params.get("pestana") as Pestana) || "empresa");
  const setPestana = (p: Pestana) => { setPestanaEstado(p); setParams({ pestana: p }, { replace: true }); };
  // Vuelta de Google / Microsoft tras conectar la cuenta de correo
  useEffect(() => {
    const r = params.get("correo");
    if (!r) return;
    if (r === "ok") toast.success("Cuenta de correo conectada");
    else toast.error(params.get("mensaje") || "No se pudo conectar la cuenta de correo");
    setParams({ pestana: "correo" }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pestanas: { k: Pestana; t: string; admin?: boolean }[] = [
    { k: "empresa", t: "Mi empresa" },
    { k: "series", t: "Series y formas de pago" },
    { k: "ventas", t: "Ventas" },
    { k: "compras", t: "Compras" },
    { k: "cobros", t: "Cobros" },
    { k: "correo", t: "Correo" },
    { k: "usuarios", t: "Usuarios", admin: true },
    { k: "actualizaciones", t: "Actualizaciones", admin: true },
    { k: "actividad", t: "Actividad", admin: true },
  ];

  return (
    <div>
      <PageHeader title="Ajustes" />
      <div className="mb-4 flex gap-4 overflow-x-auto border-b border-stroke" role="tablist">
        {pestanas.filter((p) => !p.admin || admin).map((p) => (
          <button key={p.k} role="tab" aria-selected={pestana === p.k} onClick={() => setPestana(p.k)}
            className={cn("relative whitespace-nowrap px-1 pb-2 text-sm", pestana === p.k ? "font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full after:bg-brand-fg" : "text-muted hover:text-fg")}>
            {p.t}
          </button>
        ))}
      </div>
      {pestana === "empresa" ? <PestanaEmpresa admin={admin} /> : null}
      {pestana === "series" ? <PestanaSeries admin={admin} /> : null}
      {pestana === "ventas" ? <PestanaVentas admin={admin} /> : null}
      {pestana === "compras" ? <PestanaCompras admin={admin} /> : null}
      {pestana === "cobros" ? <PestanaCobros admin={admin} /> : null}
      {pestana === "correo" ? <PestanaCorreo admin={admin} /> : null}
      {pestana === "usuarios" && admin ? <PestanaUsuarios /> : null}
      {pestana === "actualizaciones" && admin ? <PestanaActualizaciones /> : null}
      {pestana === "actividad" && admin ? <PestanaActividad /> : null}
    </div>
  );
}

function PestanaEmpresa({ admin }: { admin: boolean }) {
  const qc = useQueryClient();
  const { recargar } = useSesion();
  const q = useQuery({ queryKey: ["ajustes"], queryFn: () => api.get<TAjustes>("/ajustes") });
  const [e, setE] = useState<Empresa>(EMPRESA_VACIA);
  useEffect(() => { if (q.data) setE({ ...EMPRESA_VACIA, ...q.data.empresa }); }, [q.data]);
  const guardar = useMutation({
    mutationFn: () => api.put("/ajustes/empresa", e),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ajustes"] }); recargar(); toast.success("Datos de la empresa guardados"); },
    onError: (err) => toast.error((err as Error).message),
  });
  if (!q.data) return <Loading />;
  const enviar = (ev: FormEvent) => { ev.preventDefault(); guardar.mutate(); };
  return (
    <form onSubmit={enviar} className="card max-w-3xl p-5">
      <EmpresaForm valor={e} onChange={setE} disabled={!admin} />
      {admin ? <div className="mt-4 flex justify-end"><Button type="submit" variant="primary" disabled={guardar.isPending}>Guardar</Button></div>
        : <p className="mt-4 text-sm text-muted">Solo un administrador puede cambiar estos datos.</p>}
    </form>
  );
}

function PestanaSeries({ admin }: { admin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ajustes"], queryFn: () => api.get<TAjustes>("/ajustes") });
  const [serie, setSerie] = useState({ codigo: "", descripcion: "", tipo: "normal", formato: "" });
  const [fp, setFp] = useState<{ codigo: string; descripcion: string; dias: number; muestra_iban: boolean; plazos: Plazo[] }>({ codigo: "", descripcion: "", dias: 0, muestra_iban: false, plazos: [] });
  const ok = () => qc.invalidateQueries({ queryKey: ["ajustes"] });
  const err = (e: unknown) => toast.error((e as Error).message);
  const [formatos, setFormatos] = useState({ presupuesto: "", proforma: "" });
  useEffect(() => { if (q.data) setFormatos(q.data.formatos); }, [q.data]);
  const editarFormato = useMutation({
    mutationFn: ({ codigo, formato }: { codigo: string; formato: string }) => api.put(`/series/${codigo}`, { formato }),
    onSuccess: () => { ok(); toast.success("Formato guardado"); }, onError: err,
  });
  const guardarFormatos = useMutation({ mutationFn: () => api.put("/ajustes/general", { formatos }), onSuccess: () => { ok(); toast.success("Formatos guardados"); }, onError: err });
  const crearSerie = useMutation({ mutationFn: () => api.post("/series", serie), onSuccess: () => { ok(); setSerie({ codigo: "", descripcion: "", tipo: "normal", formato: "" }); }, onError: err });
  const borrarSerie = useMutation({ mutationFn: (c: string) => api.del(`/series/${c}`), onSuccess: ok, onError: err });
  const defecto = useMutation({ mutationFn: (c: string) => api.put("/ajustes/general", { serie_defecto: c }), onSuccess: ok, onError: err });
  const guardarFp = useMutation({ mutationFn: () => api.post("/formas-pago", fp), onSuccess: () => { ok(); setFp({ codigo: "", descripcion: "", dias: 0, muestra_iban: false, plazos: [] }); toast.success("Forma de pago guardada"); }, onError: err });
  const borrarFp = useMutation({ mutationFn: (c: string) => api.del(`/formas-pago/${c}`), onSuccess: ok, onError: err });
  if (!q.data) return <Loading />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h2 className="mb-2 text-base font-semibold">Series de facturación</h2>
        <Table>
          <thead><tr><th className={th}>Código</th><th className={th}>Descripción</th><th className={th}>Tipo</th><th className={th}>Numeración</th><th className={th} /></tr></thead>
          <tbody>
            {q.data.series.map((s) => (
              <tr key={s.codigo}>
                <td className={cn(td, "font-semibold")}>{s.codigo}</td>
                <td className={td}>{s.descripcion}{q.data.serie_defecto === s.codigo ? <span className="ml-2 rounded bg-brand-soft px-1.5 text-xs text-brand-fg">Por defecto</span> : null}</td>
                <td className={cn(td, "capitalize")}>{s.tipo}</td>
                <td className={td}>
                  {admin ? (
                    <Input defaultValue={s.formato} className="h-7 w-32 font-mono text-xs" aria-label={`Formato de la serie ${s.codigo}`}
                      onBlur={(e) => e.target.value !== s.formato && editarFormato.mutate({ codigo: s.codigo, formato: e.target.value })} />
                  ) : <code className="text-xs">{s.formato}</code>}
                </td>
                <td className={cn(td, "whitespace-nowrap text-right")}>
                  {admin && s.tipo === "normal" && q.data.serie_defecto !== s.codigo ? <Button size="sm" variant="subtle" onClick={() => defecto.mutate(s.codigo)}>Usar por defecto</Button> : null}
                  {admin ? <Button size="icon" variant="subtle" aria-label="Eliminar" onClick={() => borrarSerie.mutate(s.codigo)}><Trash2 size={16} /></Button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {admin ? (
          <form className="card mt-2 flex flex-wrap items-end gap-2 p-3" onSubmit={(e) => { e.preventDefault(); crearSerie.mutate(); }}>
            <Field label="Código" className="w-20"><Input value={serie.codigo} onChange={(e) => setSerie({ ...serie, codigo: e.target.value })} maxLength={4} required className="uppercase" /></Field>
            <Field label="Descripción" className="min-w-[140px] flex-1"><Input value={serie.descripcion} onChange={(e) => setSerie({ ...serie, descripcion: e.target.value })} /></Field>
            <Field label="Numeración" className="w-32"><Input value={serie.formato} onChange={(e) => setSerie({ ...serie, formato: e.target.value })} placeholder="{num}/{año}" className="font-mono text-xs" /></Field>
            <Field label="Tipo" className="w-36">
              <Select value={serie.tipo} onChange={(e) => setSerie({ ...serie, tipo: e.target.value })}>
                <option value="normal">Normal</option><option value="rectificativa">Rectificativa</option><option value="simplificada">Simplificada</option>
              </Select>
            </Field>
            <Button type="submit" variant="primary"><Plus size={16} /> Añadir</Button>
          </form>
        ) : null}
      </section>

      <section className="card p-4 text-sm lg:col-span-2">
        <h2 className="mb-1 text-base font-semibold">Formato de numeración</h2>
        <p className="mb-3 text-muted">
          Variables: <code>{"{num}"}</code> número, <code>{"{num4}"}</code> número con 4 cifras, <code>{"{año}"}</code>, <code>{"{aa}"}</code> año con 2 cifras y <code>{"{serie}"}</code>.
          Ejemplo: <code>{"{num}/{año}"}</code> → 31/2026. El cambio solo afecta a los documentos que se emitan a partir de ahora.
        </p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); guardarFormatos.mutate(); }}>
          <Field label="Presupuestos" className="w-40"><Input value={formatos.presupuesto} onChange={(e) => setFormatos({ ...formatos, presupuesto: e.target.value })} disabled={!admin} className="font-mono text-xs" /></Field>
          <Field label="Proformas" className="w-40"><Input value={formatos.proforma} onChange={(e) => setFormatos({ ...formatos, proforma: e.target.value })} disabled={!admin} className="font-mono text-xs" /></Field>
          {admin ? <Button type="submit">Guardar</Button> : null}
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Formas de pago</h2>
        <Table>
          <thead><tr><th className={th}>Código</th><th className={th}>Descripción</th><th className={th}>Vencimientos</th><th className={th}>IBAN en PDF</th><th className={th} /></tr></thead>
          <tbody>
            {q.data.formas_pago.map((f) => (
              <tr key={f.codigo} className="cursor-pointer hover:bg-subtle" onClick={() => admin && setFp({ ...f, muestra_iban: !!f.muestra_iban, plazos: f.plazos || [] })}>
                <td className={cn(td, "font-semibold")}>{f.codigo}</td><td className={td}>{f.descripcion}</td>
                <td className={cn(td, "tnum")}>{f.plazos?.length ? f.plazos.map((p) => `${p.dias}d (${p.pct}%)`).join(" · ") : f.dias ? `${f.dias} días` : "Al momento"}</td><td className={td}>{f.muestra_iban ? "Sí" : "No"}</td>
                <td className={cn(td, "text-right")}>{admin ? <Button size="icon" variant="subtle" aria-label="Eliminar" onClick={(e) => { e.stopPropagation(); borrarFp.mutate(f.codigo); }}><Trash2 size={16} /></Button> : null}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        {admin ? (
          <form className="card mt-2 flex flex-wrap items-end gap-2 p-3" onSubmit={(e) => { e.preventDefault(); guardarFp.mutate(); }}>
            <Field label="Código" className="w-24"><Input value={fp.codigo} onChange={(e) => setFp({ ...fp, codigo: e.target.value })} required className="uppercase" /></Field>
            <Field label="Descripción" className="min-w-[140px] flex-1"><Input value={fp.descripcion} onChange={(e) => setFp({ ...fp, descripcion: e.target.value })} /></Field>
            <Field label="Días" className="w-20"><Input type="number" min={0} value={fp.dias} onChange={(e) => setFp({ ...fp, dias: Number(e.target.value) })} /></Field>
            <label className="flex h-8 items-center gap-1.5 text-sm"><input type="checkbox" checked={fp.muestra_iban} onChange={(e) => setFp({ ...fp, muestra_iban: e.target.checked })} /> IBAN</label>
            <div className="w-full">
              <span className="field-label">Plazos (opcional)</span>
              <PlazosEditor valor={fp.plazos} onChange={(p) => setFp({ ...fp, plazos: p })} />
            </div>
            <Button type="submit" variant="primary">Guardar</Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}

type UsuarioFila = Usuario & { activo: number; ultimo_login: string | null };

function PestanaUsuarios() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["usuarios"], queryFn: () => api.get<UsuarioFila[]>("/usuarios") });
  const [dlg, setDlg] = useState<null | UsuarioFila | "nuevo">(null);
  const [f, setF] = useState({ usuario: "", nombre: "", email: "", password: "", rol: "usuario", activo: true });
  useEffect(() => {
    if (dlg === "nuevo") setF({ usuario: "", nombre: "", email: "", password: "", rol: "usuario", activo: true });
    else if (dlg) setF({ usuario: dlg.usuario, nombre: dlg.nombre, email: dlg.email, password: "", rol: dlg.rol, activo: !!dlg.activo });
  }, [dlg]);
  const guardar = useMutation({
    mutationFn: () => (dlg === "nuevo" ? api.post("/usuarios", f) : api.put(`/usuarios/${(dlg as UsuarioFila).id}`, { ...f, password: f.password || undefined })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["usuarios"] }); setDlg(null); toast.success("Usuario guardado"); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!q.data) return <Loading />;
  return (
    <div>
      <div className="mb-2 flex justify-end"><Button variant="primary" onClick={() => setDlg("nuevo")}><Plus size={16} /> Nuevo usuario</Button></div>
      <Table>
        <thead><tr><th className={th}>Usuario</th><th className={th}>Nombre</th><th className={th}>Rol</th><th className={th}>Estado</th><th className={cn(th, "hidden md:table-cell")}>Último acceso</th></tr></thead>
        <tbody>
          {q.data.map((u) => (
            <tr key={u.id} className="cursor-pointer hover:bg-subtle" onClick={() => setDlg(u)}>
              <td className={cn(td, "font-semibold")}>{u.usuario}</td><td className={td}>{u.nombre}</td>
              <td className={td}>{u.rol === "admin" ? "Administrador" : "Usuario"}</td>
              <td className={td}>{u.activo ? "Activo" : <span className="text-muted">Desactivado</span>}</td>
              <td className={cn(td, "hidden text-muted md:table-cell")}>{u.ultimo_login ? new Date(`${u.ultimo_login}Z`).toLocaleString("es-ES") : "Nunca"}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Dialog open={!!dlg} onOpenChange={(v) => !v && setDlg(null)} title={dlg === "nuevo" ? "Nuevo usuario" : "Editar usuario"}
        footer={<><Button onClick={() => setDlg(null)}>Cancelar</Button><Button variant="primary" type="submit" form="form-usuario" disabled={guardar.isPending}>Guardar</Button></>}>
        <form id="form-usuario" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); guardar.mutate(); }}>
          <Field label="Usuario"><Input value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} disabled={dlg !== "nuevo"} required /></Field>
          <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required /></Field>
          <Field label="Email" className="sm:col-span-2"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label={dlg === "nuevo" ? "Contraseña" : "Nueva contraseña (opcional)"} hint="Mínimo 10 caracteres, con mayúsculas, minúsculas, números y un símbolo" className="sm:col-span-2">
            <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required={dlg === "nuevo"} autoComplete="new-password" />
          </Field>
          <Field label="Rol"><Select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}><option value="usuario">Usuario</option><option value="admin">Administrador</option></Select></Field>
          {dlg !== "nuevo" ? (
            <Field label="Estado"><Select value={f.activo ? "1" : "0"} onChange={(e) => setF({ ...f, activo: e.target.value === "1" })}><option value="1">Activo</option><option value="0">Desactivado</option></Select></Field>
          ) : null}
        </form>
      </Dialog>
    </div>
  );
}

function PestanaActividad() {
  const q = useQuery({ queryKey: ["auditoria"], queryFn: () => api.get<{ id: number; fecha: string; usuario: string | null; ip: string | null; accion: string; detalle: string; severidad: string }[]>("/auditoria") });
  if (!q.data) return <Loading />;
  return (
    <Table>
      <thead><tr><th className={th}>Fecha</th><th className={th}>Nivel</th><th className={th}>Usuario</th><th className={th}>Acción</th><th className={th}>Detalle</th><th className={cn(th, "hidden md:table-cell")}>IP</th></tr></thead>
      <tbody>
        {q.data.map((a) => (
          <tr key={a.id}>
            <td className={cn(td, "whitespace-nowrap")}>{new Date(`${a.fecha}Z`).toLocaleString("es-ES")}</td>
            <td className={td}>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold",
                a.severidad === "alerta" ? "bg-danger/15 text-danger" : a.severidad === "aviso" ? "bg-warning/15 text-warning" : "bg-subtle text-muted")}>
                {a.severidad === "alerta" ? "Alerta" : a.severidad === "aviso" ? "Aviso" : "Info"}
              </span>
            </td>
            <td className={td}>{a.usuario || "—"}</td><td className={cn(td, "font-mono text-xs")}>{a.accion}</td>
            <td className={cn(td, "text-muted")}>{a.detalle}</td><td className={cn(td, "hidden text-muted md:table-cell")}>{a.ip}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

const OPCIONES_COBRO: { k: keyof AjustesCobros; t: string; d: string }[] = [
  { k: "recibos_por_plazos", t: "Dividir las facturas en plazos", d: "Usa los plazos de la forma de pago o del cliente (p. ej. 30-60-90). Si está desactivado, cada factura tiene un solo vencimiento." },
  { k: "cobros_parciales", t: "Permitir cobros parciales", d: "Apuntar que un cliente ha pagado solo una parte de un recibo." },
  { k: "menu_cobros", t: "Mostrar «Cobros» en el menú", d: "Listado de recibos pendientes, vencidos y cobrados." },
  { k: "panel_en_factura", t: "Mostrar vencimientos y cobros en la factura", d: "Panel dentro de cada factura emitida para cobrar y editar vencimientos." },
  { k: "vencimientos_en_pdf", t: "Imprimir los vencimientos en el PDF", d: "Solo cuando la factura tiene más de un vencimiento." },
  { k: "avisos", t: "Avisos de cobro", d: "Campana en la barra superior con los recibos que vencen pronto y los impagados." },
  { k: "avisos_en_inicio", t: "Mostrar los avisos en el inicio", d: "Bloque de avisos en la pantalla de inicio." },
];

function PestanaCobros({ admin }: { admin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ajustes"], queryFn: () => api.get<TAjustes>("/ajustes") });
  const [o, setO] = useState<AjustesCobros | null>(null);
  useEffect(() => { if (q.data) setO(q.data.cobros); }, [q.data]);
  const guardar = useMutation({
    mutationFn: () => api.put("/cobros/ajustes", o),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ajustes"] }); qc.invalidateQueries({ queryKey: ["avisos"] }); toast.success("Opciones de cobro guardadas"); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!o) return <Loading />;
  return (
    <form className="card max-w-3xl divide-y divide-stroke p-0" onSubmit={(e) => { e.preventDefault(); guardar.mutate(); }}>
      {OPCIONES_COBRO.map((op) => (
        <label key={op.k} className={cn("flex items-start gap-3 px-5 py-3", admin && "cursor-pointer hover:bg-subtle/60")}>
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--brand))]" checked={!!o[op.k]} disabled={!admin}
            onChange={(e) => setO({ ...o, [op.k]: e.target.checked })} />
          <span>
            <span className="block text-sm font-semibold">{op.t}</span>
            <span className="block text-xs text-muted">{op.d}</span>
          </span>
        </label>
      ))}
      <div className={cn("grid gap-3 px-5 py-3 sm:grid-cols-2", !o.avisos && "opacity-50")}>
        <Field label="Avisar antes del vencimiento" hint="Días de antelación (0 = no avisar antes)">
          <Input type="number" min={0} max={365} value={o.aviso_dias_antes} disabled={!admin || !o.avisos} onChange={(e) => setO({ ...o, aviso_dias_antes: Number(e.target.value) })} />
        </Field>
        <Field label="Avisar de impagados" hint="Días después del vencimiento (mínimo 1)">
          <Input type="number" min={1} max={365} value={o.aviso_impagado_dias} disabled={!admin || !o.avisos} onChange={(e) => setO({ ...o, aviso_impagado_dias: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="flex items-center justify-between px-5 py-3">
        <p className="text-xs text-muted">Los recordatorios por email llegarán con la fase de email.</p>
        {admin ? <Button type="submit" variant="primary" disabled={guardar.isPending}>Guardar</Button> : <span className="text-xs text-muted">Solo un administrador puede cambiarlas.</span>}
      </div>
    </form>
  );
}

const OPCIONES_VENTA: { k: keyof AjustesVentas; t: string; d: string }[] = [
  { k: "pedidos", t: "Usar pedidos", d: "Muestra «Pedidos» en el menú y permite convertir presupuestos en pedidos." },
  { k: "albaranes", t: "Usar albaranes", d: "Muestra «Albaranes» en el menú, con firma del receptor y facturación del mes." },
  { k: "albaran_valorado", t: "Albaranes valorados por defecto", d: "Los albaranes nuevos salen con precios. Se puede cambiar en cada albarán." },
  { k: "indicar_albaran_en_factura", t: "Indicar el albarán en cada línea de la factura", d: "Al facturar albaranes, cada línea empieza con su número y fecha (p. ej. «ALB12/2026 (03/11/2026) · …»)." },
  { k: "facturar_mes_emitir", t: "«Facturar el mes» emite las facturas directamente", d: "Si está desactivado, se crean como borrador para revisarlas antes." },
];

function PestanaVentas({ admin }: { admin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ajustes"], queryFn: () => api.get<TAjustes>("/ajustes") });
  const [o, setO] = useState<AjustesVentas | null>(null);
  useEffect(() => { if (q.data) setO(q.data.ventas); }, [q.data]);
  const guardar = useMutation({
    mutationFn: () => api.put("/documentos/ajustes-ventas", o),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ajustes"] }); toast.success("Opciones de ventas guardadas"); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!o) return <Loading />;
  return (
    <form className="card max-w-3xl divide-y divide-stroke p-0" onSubmit={(e) => { e.preventDefault(); guardar.mutate(); }}>
      {OPCIONES_VENTA.map((op) => (
        <label key={op.k} className={cn("flex items-start gap-3 px-5 py-3", admin && "cursor-pointer hover:bg-subtle/60")}>
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--brand))]" checked={!!o[op.k]} disabled={!admin}
            onChange={(e) => setO({ ...o, [op.k]: e.target.checked })} />
          <span>
            <span className="block text-sm font-semibold">{op.t}</span>
            <span className="block text-xs text-muted">{op.d}</span>
          </span>
        </label>
      ))}
      <div className="flex justify-end px-5 py-3">
        {admin ? <Button type="submit" variant="primary" disabled={guardar.isPending}>Guardar</Button> : <span className="text-xs text-muted">Solo un administrador puede cambiarlas.</span>}
      </div>
    </form>
  );
}

const OPCIONES_COMPRA: { k: keyof AjustesCompras; t: string; d: string }[] = [
  { k: "gastos", t: "Usar gastos y tickets", d: "Para tickets de gasolina, peajes, parking… que no son una factura completa." },
  { k: "gasto_pagado", t: "Dar los gastos por pagados al registrarlos", d: "Lo normal en tickets: se pagan en el momento." },
  { k: "gasto_deducible", t: "IVA de los gastos deducible por defecto", d: "Se puede cambiar en cada gasto. Solo es deducible si el ticket es una factura simplificada con tu NIF." },
  { k: "pedidos_compra", t: "Usar pedidos a proveedor", d: "Hacer pedidos y convertirlos en albarán o factura cuando llegan." },
  { k: "albaranes_compra", t: "Usar albaranes de proveedor", d: "Registrar los albaranes que entrega el proveedor y facturarlos juntos." },
  { k: "presupuestos_compra", t: "Usar presupuestos de proveedor", d: "Guardar los presupuestos que piden a los proveedores." },
  { k: "vehiculos", t: "Asignar gastos a vehículos", d: "Cada línea de compra puede indicar su vehículo (gasóleo, ITV, ruedas…) para saber cuánto cuesta cada uno." },
  { k: "menu_pagos", t: "Mostrar «Pagos» en el menú", d: "Listado de pagos pendientes y vencidos a proveedores." },
];

function PestanaCompras({ admin }: { admin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ajustes"], queryFn: () => api.get<TAjustes>("/ajustes") });
  const [o, setO] = useState<AjustesCompras | null>(null);
  useEffect(() => { if (q.data) setO(q.data.compras); }, [q.data]);
  const guardar = useMutation({
    mutationFn: () => api.put("/documentos/ajustes-compras", o),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ajustes"] }); toast.success("Opciones de compras guardadas"); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!o) return <Loading />;
  return (
    <form className="card max-w-3xl divide-y divide-stroke p-0" onSubmit={(e) => { e.preventDefault(); guardar.mutate(); }}>
      {OPCIONES_COMPRA.map((op) => (
        <label key={op.k} className={cn("flex items-start gap-3 px-5 py-3", admin && "cursor-pointer hover:bg-subtle/60")}>
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--brand))]" checked={!!o[op.k]} disabled={!admin}
            onChange={(e) => setO({ ...o, [op.k]: e.target.checked })} />
          <span>
            <span className="block text-sm font-semibold">{op.t}</span>
            <span className="block text-xs text-muted">{op.d}</span>
          </span>
        </label>
      ))}
      <div className="flex justify-end px-5 py-3">
        {admin ? <Button type="submit" variant="primary" disabled={guardar.isPending}>Guardar</Button> : <span className="text-xs text-muted">Solo un administrador puede cambiarlas.</span>}
      </div>
    </form>
  );
}
