import { Link } from "react-router-dom";
import { MessageCircle, Clock, MapPin } from "lucide-react";
import { Container } from "@/components/ui/container";
import { BrandMark } from "@/components/site/brand-mark";
import { contacto, sedes } from "@/lib/data";

export function Footer() {
  return (
    <footer className="gradient-bg mt-auto text-white">
      <Container className="grid gap-10 py-16 sm:grid-cols-3">
        <div>
          <BrandMark variant="light" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-sky-100">
            Sesiones de fisioterapia personalizadas para recuperar tu
            movimiento, a tu ritmo.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-200">
            Contacto
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-white/90">
            <li>
              <a
                href={contacto.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 transition-colors hover:text-white"
              >
                <MessageCircle size={15} className="text-sky-100" />
                WhatsApp {contacto.whatsapp}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <Clock size={15} className="mt-0.5 shrink-0 text-sky-100" />
              {contacto.horarioGeneral}
            </li>
            {sedes.map((s) => (
              <li key={s.codigo} className="flex items-start gap-2.5">
                <MapPin size={15} className="mt-0.5 shrink-0 text-sky-100" />
                <span>
                  {s.nombre} · {s.ciudad}
                  <span className="block text-xs text-sky-100/80">{s.nota}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-200">
            Enlaces
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-white/90">
            <li>
              <Link to="/servicios" className="transition-colors hover:text-white">
                Servicios
              </Link>
            </li>
            <li>
              <Link to="/resenas" className="transition-colors hover:text-white">
                Reseñas
              </Link>
            </li>
            <li>
              <Link to="/reservar" className="transition-colors hover:text-white">
                Reservar cita
              </Link>
            </li>
            <li>
              <Link
                to="/admin/login"
                className="transition-colors hover:text-white"
              >
                Acceso administrativo
              </Link>
            </li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-white/10 py-5 text-center text-xs text-sky-100/80">
        © {new Date().getFullYear()} Fisioterapeuta Li — HackTech 5.0
      </div>
    </footer>
  );
}
