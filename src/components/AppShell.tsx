import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Bell, BookOpen, Building2, Download, ChevronDown, ChevronLeft, ClipboardList, FileInput, HandCoins, PackageCheck, Receipt, ShoppingCart, Truck, FileClock, FileText, Grid3x3, HelpCircle, Home, LifeBuoy, LogOut, Menu, Moon, Package, Plus, Puzzle, ScrollText, Settings, Sun, UserCog, Users, Wallet,
} from "lucide-react";
import { useSesion } from "@/hooks/sesion";
import { api, type Ajustes, type Avisos } from "@/lib/api";
import { ListaAvisos } from "@/components/Avisos";
import { PanelAyuda } from "@/components/PanelAyuda";
import { useApariencia } from "@/hooks/apariencia";
import { cn } from "@/lib/utils";

interface ItemMenu { to: string; label: string; icon: ReactNode; admin?: boolean }
interface Seccion { id: string; titulo: string | null; items: ItemMenu[] }

function leerTema(): "light" | "dark" | "system" {
  try { return (localStorage.getItem("tema") as "light" | "dark" | null) || "system"; } catch { return "system"; }
}
function aplicarTema(t: "light" | "dark" | "system") {
  const el = document.documentElement;
  el.classList.remove("light", "dark");
  if (t !== "system") el.classList.add(t);
  try { if (t === "system") localStorage.removeItem("tema"); else localStorage.setItem("tema", t); } catch { /* sin almacenamiento */ }
}
aplicarTema(leerTema());

function esOscuro() {
  const el = document.documentElement;
  return el.classList.contains("dark") || (!el.classList.contains("light") && matchMedia("(prefers-color-scheme: dark)").matches);
}

export function AppShell() {
  const { usuario, empresa, salir } = useSesion();
  const navigate = useNavigate();
  const location = useLocation();
  const [compacto, setCompacto] = useState(() => { try { return localStorage.getItem("nav-compacto") === "1"; } catch { return false; } });
  const [movilAbierto, setMovilAbierto] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [oscuro, setOscuro] = useState(esOscuro);
  const [verAvisos, setVerAvisos] = useState(false);
  const [verAyuda, setVerAyuda] = useState(false);
  const { tema } = useApariencia();
  const menuSuperior = tema?.menu === "superior";
  // El tema puede fijar el modo claro/oscuro (o no tener variante oscura): entonces no se muestra el botón
  const modoFijo = !!tema && ((tema.modo && tema.modo !== "auto") || !tema.oscuro);
  const [desplegada, setDesplegada] = useState<string | null>(null);
  const [plegadas, setPlegadas] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem("menu-plegado") || "[]")); } catch { return new Set(); } });
  const alternarSeccion = (id: string) => {
    const n = new Set(plegadas);
    if (n.has(id)) n.delete(id); else n.add(id);
    setPlegadas(n);
    try { localStorage.setItem("menu-plegado", JSON.stringify([...n])); } catch { /* sin almacenamiento */ }
  };
  const ajustes = useQuery({ queryKey: ["ajustes"], queryFn: () => api.get<Ajustes>("/ajustes") });
  const avisos = useQuery({
    queryKey: ["avisos"], queryFn: () => api.get<Avisos>("/cobros/avisos"),
    refetchInterval: 5 * 60 * 1000, enabled: ajustes.data?.cobros.avisos !== false,
  });
  const act = useQuery({
    queryKey: ["actualizaciones"], queryFn: () => api.get<{ disponible: { version: string } | null }>("/actualizaciones"),
    enabled: usuario?.rol === "admin", refetchInterval: 60 * 60 * 1000,
  });
  const numAvisos = (avisos.data?.proximos.length || 0) + (avisos.data?.impagados.length || 0) + (avisos.data?.pagos?.length || 0) + (avisos.data?.plugins?.length || 0);
  const plugins = useQuery({
    queryKey: ["plugins-menu"],
    queryFn: () => api.get<{ id: string; nombre: string; menu: { titulo: string }[] }[]>("/plugins/menu"),
  });

  useEffect(() => { setMovilAbierto(false); setMenuUsuario(false); setVerAvisos(false); }, [location.pathname]);
  useEffect(() => { try { localStorage.setItem("nav-compacto", compacto ? "1" : "0"); } catch { /* */ } }, [compacto]);
  // F1 abre o cierra la ayuda de la pantalla actual (como en los programas de escritorio)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "F1") { e.preventDefault(); setVerAyuda((v) => !v); } };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const v = ajustes.data?.ventas;
  const c = ajustes.data?.compras;
  const si = (cond: unknown, item: ItemMenu) => (cond === false ? [] : [item]);
  const secciones: Seccion[] = [
    { id: "inicio", titulo: null, items: [{ to: "/", label: "Inicio", icon: <Home size={20} /> }] },
    { id: "ventas", titulo: "Ventas", items: [
      { to: "/facturas", label: "Facturas", icon: <FileText size={20} /> },
      { to: "/presupuestos", label: "Presupuestos", icon: <ScrollText size={20} /> },
      { to: "/proformas", label: "Proformas", icon: <FileClock size={20} /> },
      ...si(v?.pedidos, { to: "/pedidos", label: "Pedidos", icon: <ClipboardList size={20} /> }),
      ...si(v?.albaranes, { to: "/albaranes", label: "Albaranes", icon: <Truck size={20} /> }),
      ...si(ajustes.data?.cobros.menu_cobros, { to: "/cobros", label: "Cobros", icon: <Wallet size={20} /> }),
    ] },
    { id: "compras", titulo: "Compras", items: [
      { to: "/compras/facturas", label: "Facturas recibidas", icon: <FileInput size={20} /> },
      ...si(c?.gastos, { to: "/compras/gastos", label: "Gastos y tickets", icon: <Receipt size={20} /> }),
      ...si(c?.pedidos_compra, { to: "/compras/pedidos", label: "Pedidos a proveedor", icon: <ShoppingCart size={20} /> }),
      ...si(c?.albaranes_compra, { to: "/compras/albaranes", label: "Albaranes de proveedor", icon: <PackageCheck size={20} /> }),
      ...(c?.presupuestos_compra ? [{ to: "/compras/presupuestos", label: "Presupuestos de proveedor", icon: <ScrollText size={20} /> }] : []),
      ...si(c?.menu_pagos, { to: "/pagos", label: "Pagos", icon: <HandCoins size={20} /> }),
    ] },
    { id: "datos", titulo: "Datos", items: [
      { to: "/clientes", label: "Clientes", icon: <Users size={20} /> },
      { to: "/proveedores", label: "Proveedores", icon: <Building2 size={20} /> },
      ...si(c?.vehiculos, { to: "/vehiculos", label: "Vehículos", icon: <Truck size={20} /> }),
      { to: "/productos", label: "Productos", icon: <Package size={20} /> },
    ] },
    { id: "general", titulo: "General", items: [
      { to: "/informes", label: "Informes", icon: <BarChart3 size={20} /> },
      ...(plugins.data || []).flatMap((p) => p.menu.map((m) => ({ to: `/p/${p.id}`, label: m.titulo, icon: <Grid3x3 size={20} /> }))),
      ...(usuario?.rol === "admin" ? [{ to: "/plugins", label: "Plugins", icon: <Puzzle size={20} /> }] : []),
      { to: "/ajustes", label: "Ajustes", icon: <Settings size={20} /> },
      { to: "/ayuda", label: "Ayuda", icon: <LifeBuoy size={20} /> },
    ] },
  ];
  const iniciales = (usuario?.nombre || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const nav = (
    <nav className="flex flex-col gap-0.5 p-2" aria-label="Navegación principal">
      {secciones.map((sec) => (
        <div key={sec.id} className="mb-1">
          {sec.titulo && !compacto ? (
            <button onClick={() => alternarSeccion(sec.id)} aria-expanded={!plegadas.has(sec.id)}
              className="flex w-full items-center justify-between px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-fg">
              {sec.titulo}<ChevronDown size={12} className={cn("transition-transform", plegadas.has(sec.id) && "-rotate-90")} />
            </button>
          ) : sec.titulo ? <div className="mx-3 my-2 border-t border-stroke" /> : null}
          {(compacto || !plegadas.has(sec.id)) && sec.items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === "/"}
          title={compacto ? it.label : undefined}
          className={({ isActive }) => cn(
            "relative flex h-10 items-center gap-3 rounded px-3 text-sm transition-colors hover:bg-subtle",
            isActive && "bg-subtle font-semibold before:absolute before:left-0 before:top-2.5 before:h-5 before:w-[3px] before:rounded-full before:bg-brand-fg",
          )}
        >
          <span className="shrink-0">{it.icon}</span>
          <span className={cn("truncate", compacto && "lg:hidden")}>{it.label}</span>
        </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Barra superior (suite bar) */}
      <header className="barra-suite flex h-12 shrink-0 items-center gap-2 bg-suite px-2 text-suite-fg">
        <button className="rounded p-2 hover:bg-suite-fg/10 lg:hidden" onClick={() => setMovilAbierto((v) => !v)} aria-label="Menú">
          <Menu size={20} />
        </button>
        {!menuSuperior ? (
          <button className="hidden rounded p-2 hover:bg-suite-fg/10 lg:block" onClick={() => setCompacto((v) => !v)} aria-label="Contraer menú">
            {compacto ? <Menu size={20} /> : <ChevronLeft size={20} />}
          </button>
        ) : null}
        <span className="text-base font-semibold">Facturador</span>
        {empresa?.razon_social ? <span className="hidden truncate text-sm text-suite-fg/75 sm:inline">· {empresa.razon_social}</span> : null}
        <div className="flex-1" />
        <button
          className="hidden h-8 items-center gap-1.5 rounded bg-suite-fg/15 px-3 text-sm font-semibold hover:bg-suite-fg/25 sm:flex"
          onClick={() => navigate("/facturas/nueva")}
        >
          <Plus size={16} /> Nueva factura
        </button>
        {act.data?.disponible ? (
          <button onClick={() => navigate("/ajustes?pestana=actualizaciones")} title={`Versión ${act.data.disponible.version} disponible`}
            className="hidden items-center gap-1.5 rounded bg-success px-2.5 py-1 text-xs font-semibold text-white md:flex">
            <Download size={14} /> Actualización {act.data.disponible.version}
          </button>
        ) : null}
        {avisos.data?.activos ? (
          <div className="relative">
            <button className="relative rounded p-2 hover:bg-suite-fg/10" onClick={() => { setVerAvisos((v) => !v); setMenuUsuario(false); }}
              aria-label={`Avisos de cobro${numAvisos ? ` (${numAvisos})` : ""}`}>
              <Bell size={18} />
              {numAvisos ? <span className="absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-[#D13438] px-1 text-[10px] font-bold leading-4">{numAvisos > 99 ? "99+" : numAvisos}</span> : null}
            </button>
            {verAvisos ? (
              <div className="card absolute right-0 top-10 z-30 w-80 overflow-hidden text-fg shadow-flyout">
                <p className="border-b border-stroke px-3 py-2 text-sm font-semibold">Avisos de cobro</p>
                <ListaAvisos avisos={avisos.data} alPulsar={() => setVerAvisos(false)} />
              </div>
            ) : null}
          </div>
        ) : null}
        <button className={cn("rounded p-2 hover:bg-suite-fg/10", verAyuda && "bg-suite-fg/15")} onClick={() => { setVerAyuda((v) => !v); setVerAvisos(false); setMenuUsuario(false); }}
          aria-label="Ayuda de esta pantalla (F1)" title="Ayuda de esta pantalla (F1)" aria-expanded={verAyuda}>
          <HelpCircle size={18} />
        </button>
        {!modoFijo ? (
          <button
            className="rounded p-2 hover:bg-suite-fg/10"
            onClick={() => { const t = oscuro ? "light" : "dark"; aplicarTema(t); setOscuro(!oscuro); }}
            aria-label={oscuro ? "Tema claro" : "Tema oscuro"}
          >
            {oscuro ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        ) : null}
        <div className="relative">
          <button
            onClick={() => { setMenuUsuario((v) => !v); setVerAvisos(false); }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-suite-fg text-xs font-bold text-suite"
            aria-label="Cuenta"
          >
            {iniciales}
          </button>
          {menuUsuario ? (
            <div className="card absolute right-0 top-10 z-30 w-60 p-3 text-fg shadow-flyout">
              <p className="font-semibold">{usuario?.nombre}</p>
              <p className="text-xs text-muted">{usuario?.usuario} · {usuario?.rol === "admin" ? "Administrador" : "Usuario"}</p>
              <button className="mt-3 flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-subtle" onClick={() => navigate("/cuenta")}>
                <UserCog size={16} /> Mi cuenta
              </button>
              <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-subtle" onClick={() => navigate("/ayuda")}>
                <LifeBuoy size={16} /> Centro de ayuda
              </button>
              <a href="/manual-facturador.pdf" target="_blank" rel="noreferrer" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-subtle">
                <BookOpen size={16} /> Manual de uso
              </a>
              <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-subtle" onClick={salir}>
                <LogOut size={16} /> Cerrar sesión
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Menú superior (si el tema lo pide): una pestaña por sección con su desplegable */}
      {menuSuperior ? (
        <nav className="relative z-20 hidden h-11 shrink-0 items-stretch gap-1 border-b border-stroke bg-surface px-3 lg:flex" aria-label="Navegación principal"
          onMouseLeave={() => setDesplegada(null)}>
          {secciones.map((sec) => (sec.titulo ? (
            <div key={sec.id} className="relative flex items-stretch" onMouseEnter={() => setDesplegada(sec.id)}>
              <button className={cn("flex items-center gap-1 px-3 text-sm hover:bg-subtle", desplegada === sec.id && "bg-subtle font-semibold")}
                onClick={() => setDesplegada(desplegada === sec.id ? null : sec.id)} aria-expanded={desplegada === sec.id}>
                {sec.titulo} <ChevronDown size={12} />
              </button>
              {desplegada === sec.id ? (
                <div className="card absolute left-0 top-full w-60 p-1 shadow-flyout">
                  {sec.items.map((it) => (
                    <NavLink key={it.to} to={it.to} end={it.to === "/"} onClick={() => setDesplegada(null)}
                      className={({ isActive }) => cn("flex h-9 items-center gap-3 rounded px-3 text-sm hover:bg-subtle", isActive && "bg-subtle font-semibold")}>
                      <span className="shrink-0">{it.icon}</span>{it.label}
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          ) : sec.items.map((it) => (
            <NavLink key={it.to} to={it.to} end className={({ isActive }) => cn("flex items-center gap-2 px-3 text-sm hover:bg-subtle", isActive && "font-semibold text-brand-fg")}>
              {it.icon}{it.label}
            </NavLink>
          ))))}
        </nav>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Navegación lateral */}
        {!menuSuperior ? (
          <aside className={cn("hidden shrink-0 overflow-y-auto border-r border-stroke bg-surface lg:block", compacto ? "w-14" : "w-56")}>
            {nav}
          </aside>
        ) : null}
        {movilAbierto ? (
          <div className="fixed inset-0 top-12 z-30 lg:hidden" onClick={() => setMovilAbierto(false)}>
            <div className="absolute inset-0 bg-black/30" />
            <aside className="absolute left-0 top-0 h-full w-64 overflow-y-auto bg-surface shadow-flyout" onClick={(e) => e.stopPropagation()}>
              {nav}
            </aside>
          </div>
        ) : null}

        <PanelAyuda abierto={verAyuda} onCerrar={() => setVerAyuda(false)} />
        <main className="relative min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
