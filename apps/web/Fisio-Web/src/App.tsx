import { Routes, Route } from "react-router-dom";
import { ScrollProgress } from "@/components/site/scroll-progress";
import { PageTransition } from "@/components/site/page-transition";
import Home from "@/pages/Home";
import ServiciosPage from "@/pages/Servicios";
import NosotrosPage from "@/pages/Nosotros";
import ReservarPage from "@/pages/Reservar";
import ResenasPage from "@/pages/Resenas";
import AdminLoginPage from "@/pages/admin/Login";
import AdminAgendaPage from "@/pages/admin/Agenda";
import AdminReservasPage from "@/pages/admin/Reservas";
import AdminClientesPage from "@/pages/admin/Clientes";
import AdminServiciosPage from "@/pages/admin/Servicios";
import AdminAutomatizacionesPage from "@/pages/admin/Automatizaciones";
import AdminIntegracionesPage from "@/pages/admin/Integraciones";
import AdminHistorialPage from "@/pages/admin/Historial";
import AdminIndicadoresPage from "@/pages/admin/Indicadores";

export default function App() {
  return (
    <>
      <ScrollProgress />
      <PageTransition>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/servicios" element={<ServiciosPage />} />
          <Route path="/nosotros" element={<NosotrosPage />} />
          <Route path="/reservar" element={<ReservarPage />} />
          <Route path="/resenas" element={<ResenasPage />} />

          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/agenda" element={<AdminAgendaPage />} />
          <Route path="/admin/reservas" element={<AdminReservasPage />} />
          <Route path="/admin/clientes" element={<AdminClientesPage />} />
          <Route path="/admin/servicios" element={<AdminServiciosPage />} />
          <Route
            path="/admin/automatizaciones"
            element={<AdminAutomatizacionesPage />}
          />
          <Route
            path="/admin/integraciones"
            element={<AdminIntegracionesPage />}
          />
          <Route path="/admin/historial" element={<AdminHistorialPage />} />
          <Route path="/admin/indicadores" element={<AdminIndicadoresPage />} />
        </Routes>
      </PageTransition>
    </>
  );
}
