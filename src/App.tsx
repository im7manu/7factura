import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/ui/misc";
import { SesionProvider, useSesion } from "@/hooks/sesion";
import { useApariencia } from "@/hooks/apariencia";
import Login from "@/pages/Login";
import Setup from "@/pages/Setup";
import Inicio from "@/pages/Inicio";
import Documentos from "@/pages/Documentos";
import DocumentoEditor from "@/pages/DocumentoEditor";
import Clientes from "@/pages/Clientes";
import Productos from "@/pages/Productos";
import Informes from "@/pages/Informes";
import Ajustes from "@/pages/Ajustes";
import Plugins from "@/pages/Plugins";
import Cobros from "@/pages/Cobros";
import Vehiculos from "@/pages/Vehiculos";
import PluginFrame from "@/pages/PluginFrame";
import Ayuda from "@/pages/Ayuda";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function Rutas() {
  const { instalado, usuario } = useSesion();
  useApariencia();
  if (!instalado) return <Setup />;
  if (!usuario) return <Login />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Inicio />} />
        <Route path="facturas" element={<Documentos tipo="factura" />} />
        <Route path="facturas/nueva" element={<DocumentoEditor tipo="factura" />} />
        <Route path="facturas/:id" element={<DocumentoEditor tipo="factura" />} />
        <Route path="presupuestos" element={<Documentos tipo="presupuesto" />} />
        <Route path="presupuestos/nuevo" element={<DocumentoEditor tipo="presupuesto" />} />
        <Route path="presupuestos/:id" element={<DocumentoEditor tipo="presupuesto" />} />
        <Route path="proformas" element={<Documentos tipo="proforma" />} />
        <Route path="proformas/nueva" element={<DocumentoEditor tipo="proforma" />} />
        <Route path="proformas/:id" element={<DocumentoEditor tipo="proforma" />} />
        <Route path="pedidos" element={<Documentos tipo="pedido" />} />
        <Route path="pedidos/nuevo" element={<DocumentoEditor tipo="pedido" />} />
        <Route path="pedidos/:id" element={<DocumentoEditor tipo="pedido" />} />
        <Route path="albaranes" element={<Documentos tipo="albaran" />} />
        <Route path="albaranes/nuevo" element={<DocumentoEditor tipo="albaran" />} />
        <Route path="albaranes/:id" element={<DocumentoEditor tipo="albaran" />} />
        <Route path="cobros" element={<Cobros />} />
        <Route path="pagos" element={<Cobros ambito="compras" />} />
        <Route path="compras/presupuestos" element={<Documentos tipo="presupuesto_compra" />} />
        <Route path="compras/presupuestos/nuevo" element={<DocumentoEditor tipo="presupuesto_compra" />} />
        <Route path="compras/presupuestos/:id" element={<DocumentoEditor tipo="presupuesto_compra" />} />
        <Route path="compras/pedidos" element={<Documentos tipo="pedido_compra" />} />
        <Route path="compras/pedidos/nuevo" element={<DocumentoEditor tipo="pedido_compra" />} />
        <Route path="compras/pedidos/:id" element={<DocumentoEditor tipo="pedido_compra" />} />
        <Route path="compras/albaranes" element={<Documentos tipo="albaran_compra" />} />
        <Route path="compras/albaranes/nuevo" element={<DocumentoEditor tipo="albaran_compra" />} />
        <Route path="compras/albaranes/:id" element={<DocumentoEditor tipo="albaran_compra" />} />
        <Route path="compras/facturas" element={<Documentos tipo="factura_compra" />} />
        <Route path="compras/facturas/nueva" element={<DocumentoEditor tipo="factura_compra" />} />
        <Route path="compras/facturas/:id" element={<DocumentoEditor tipo="factura_compra" />} />
        <Route path="compras/gastos" element={<Documentos tipo="gasto" />} />
        <Route path="compras/gastos/nuevo" element={<DocumentoEditor tipo="gasto" />} />
        <Route path="compras/gastos/:id" element={<DocumentoEditor tipo="gasto" />} />
        <Route path="proveedores" element={<Clientes tipo="proveedor" />} />
        <Route path="vehiculos" element={<Vehiculos />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="productos" element={<Productos />} />
        <Route path="informes" element={<Informes />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route path="plugins" element={<Plugins />} />
        <Route path="ayuda" element={<Ayuda />} />
        <Route path="p/:id" element={<PluginFrame />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SesionProvider fallback={<Loading />}>
          <Rutas />
        </SesionProvider>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
