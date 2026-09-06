// Datos de ejemplo. Reemplazar por los que entregue el equipo de backend/n8n.

// Catálogo real de servicios (documento entregado por la clienta).

export type OpcionPrecio = {
  label: string;
  precio: number; // COP
  porSesion?: number; // COP por sesión, si aplica a un paquete
};

export type ServicioCatalogo = {
  slug: string;
  nombre: string;
  duracion: string; // texto para mostrar, ej. "1 hora"
  duracionMin: number; // minutos, para la lógica de agenda
  descripcion: string;
  opciones: OpcionPrecio[];
  reservableIndividualmente: boolean; // false = planes grupales/convenios, se gestionan por contacto directo
  notaPromo?: string;
};

export type CategoriaServicio = {
  id: string;
  nombre: string;
  descripcion?: string;
  servicios: ServicioCatalogo[];
};

export const catalogo: CategoriaServicio[] = [
  {
    id: "valoracion-rehabilitacion",
    nombre: "Valoración inicial y rehabilitación física",
    servicios: [
      {
        slug: "valoracion-inicial",
        nombre: "Valoración inicial",
        duracion: "Sesión de valoración",
        duracionMin: 45,
        descripcion:
          "Evaluación completa del estado físico para diseñar tu plan de tratamiento.",
        opciones: [{ label: "Valoración inicial", precio: 100000 }],
        reservableIndividualmente: true,
        notaPromo: "Gratis al adquirir un paquete de terapias de rehabilitación",
      },
      {
        slug: "rehabilitacion-fisica",
        nombre: "Rehabilitación / terapia física",
        duracion: "1 hora",
        duracionMin: 60,
        descripcion:
          "Sesión de rehabilitación y terapia física individual.",
        opciones: [
          { label: "Sesión individual", precio: 100000 },
          { label: "Paquete de 5 sesiones", precio: 460000, porSesion: 92000 },
          { label: "Paquete de 10 sesiones", precio: 850000, porSesion: 85000 },
        ],
        reservableIndividualmente: true,
      },
    ],
  },
  {
    id: "prescripcion-ejercicio",
    nombre: "Prescripción de ejercicio",
    descripcion: "Sesiones de 1 hora, individuales o grupales.",
    servicios: [
      {
        slug: "prescripcion-individual",
        nombre: "Plan personalizado (individual)",
        duracion: "1 hora",
        duracionMin: 60,
        descripcion: "Plan de ejercicio ajustado a tus objetivos y tu proceso.",
        opciones: [
          { label: "Sesión individual", precio: 60000 },
          { label: "Paquete de 8 sesiones", precio: 400000, porSesion: 50000 },
          { label: "Paquete de 12 sesiones", precio: 580000, porSesion: 48333 },
          { label: "Paquete de 16 sesiones", precio: 720000, porSesion: 45000 },
          { label: "Paquete de 20 sesiones", precio: 800000, porSesion: 40000 },
        ],
        reservableIndividualmente: true,
      },
      {
        slug: "prescripcion-grupal-4",
        nombre: "Plan grupal (4 personas)",
        duracion: "1 hora",
        duracionMin: 60,
        descripcion: "Precio por persona, grupo de 4 personas.",
        opciones: [
          { label: "4 sesiones (precio por persona)", precio: 150000, porSesion: 37500 },
        ],
        reservableIndividualmente: false,
      },
      {
        slug: "prescripcion-grupal-8",
        nombre: "Plan grupal (hasta 8 personas)",
        duracion: "1 hora",
        duracionMin: 60,
        descripcion: "Precio por persona, grupo de hasta 8 personas.",
        opciones: [
          { label: "8 sesiones (precio por persona)", precio: 227000, porSesion: 28375 },
          { label: "12 sesiones (precio por persona)", precio: 312000, porSesion: 26000 },
          { label: "16 sesiones (precio por persona)", precio: 384000, porSesion: 24000 },
          { label: "20 sesiones (precio por persona)", precio: 440000, porSesion: 22000 },
        ],
        reservableIndividualmente: false,
      },
    ],
  },
  {
    id: "modulacion-postejercicio",
    nombre: "Modulación postejercicio / descargas musculares",
    descripcion: "Sesiones de 1 hora.",
    servicios: [
      {
        slug: "descarga-espalda",
        nombre: "Descarga — espalda",
        duracion: "1 hora",
        duracionMin: 60,
        descripcion:
          "Espalda alta y baja en su totalidad. Terapia manual, terapia instrumental, ventosas (cupping) y pistola percutora.",
        opciones: [{ label: "Sesión", precio: 70000 }],
        reservableIndividualmente: true,
      },
      {
        slug: "descarga-miembros-inferiores",
        nombre: "Descarga — miembros inferiores",
        duracion: "1 hora",
        duracionMin: 60,
        descripcion:
          "Muslos, piernas y pies en su totalidad. Presoterapia, terapia manual, terapia instrumental y pistola percutora.",
        opciones: [{ label: "Sesión", precio: 90000 }],
        reservableIndividualmente: true,
      },
      {
        slug: "descarga-cuerpo-completo",
        nombre: "Descarga — cuerpo completo",
        duracion: "1 hora",
        duracionMin: 60,
        descripcion:
          "Miembros inferiores, espalda, miembros superiores, cuello y pecho. Presoterapia, terapia manual, instrumental, termoterapia, ventosas y pistola percutora.",
        opciones: [{ label: "Sesión", precio: 150000 }],
        reservableIndividualmente: true,
      },
    ],
  },
  {
    id: "procedimientos-especializados",
    nombre: "Procedimientos especializados",
    servicios: [
      {
        slug: "puncion-seca",
        nombre: "Punción seca",
        duracion: "1 hora",
        duracionMin: 60,
        descripcion: "Procedimiento especializado para puntos gatillo miofasciales.",
        opciones: [
          { label: "Sesión individual", precio: 120000 },
          { label: "Paquete de 5 sesiones", precio: 525000, porSesion: 105000 },
          { label: "Paquete de 10 sesiones", precio: 950000, porSesion: 95000 },
        ],
        reservableIndividualmente: true,
      },
      {
        slug: "terapia-neural",
        nombre: "Terapia neural",
        duracion: "1 a 2 horas",
        duracionMin: 90,
        descripcion: "Procedimiento especializado con fines terapéuticos.",
        opciones: [
          { label: "Sesión individual", precio: 150000 },
          { label: "Paquete de 5 sesiones", precio: 525000, porSesion: 105000 },
          { label: "Paquete de 10 sesiones", precio: 950000, porSesion: 95000 },
        ],
        reservableIndividualmente: true,
      },
      {
        slug: "prp",
        nombre: "Plasma rico en plaquetas (PRP)",
        duracion: "1 a 2 horas",
        duracionMin: 90,
        descripcion: "Procedimiento especializado de regeneración tisular.",
        opciones: [
          { label: "Sesión individual", precio: 250000 },
          { label: "Paquete de 5 sesiones", precio: 1000000, porSesion: 200000 },
          { label: "Paquete de 10 sesiones", precio: 1600000, porSesion: 160000 },
        ],
        reservableIndividualmente: true,
      },
      {
        slug: "sueroterapia",
        nombre: "Sueroterapia",
        duracion: "90 minutos",
        duracionMin: 90,
        descripcion: "Procedimiento especializado de 1 hora y media.",
        opciones: [
          { label: "Sesión individual", precio: 300000 },
          { label: "Paquete de 5 sesiones", precio: 1025000, porSesion: 205000 },
          { label: "Paquete de 10 sesiones", precio: 1900000, porSesion: 190000 },
        ],
        reservableIndividualmente: true,
      },
    ],
  },
];

export const promociones = {
  valoracionGratis:
    "La valoración inicial es gratis al adquirir cualquier paquete de terapias de rehabilitación.",
  referidos:
    "Por cada 5 pacientes referidos que agenden y asistan, el paciente referente obtiene 10% de descuento en su próximo servicio o paquete.",
};

export const politicas = {
  reserva:
    "Se requiere el pago por adelantado del 100% para confirmar el agendamiento de cualquier consulta o terapia.",
  reagendamiento:
    "Los cambios de agenda deben realizarse con mínimo 24 a 48 horas de anticipación. Si el paciente no asiste o cancela fuera de este plazo, la cita se dará por realizada y se perderá el valor pagado.",
  convenios:
    "Convenios y eventos (clubes/equipos) se gestionan mediante propuesta personalizada, con un abono inicial mínimo de $400.000.",
  mediosPago: ["Nequi / Llave: 311 398 1422 (Titular: Lina Murillo)", "Efectivo"],
};

// Vista plana de los servicios reservables individualmente, para el wizard
// de reservas y el preview del home. Los planes grupales y convenios no
// entran acá porque se gestionan por contacto directo, no por el wizard.
export const servicios = catalogo
  .flatMap((c) => c.servicios)
  .filter((s) => s.reservableIndividualmente)
  .map((s) => ({
    slug: s.slug,
    nombre: s.nombre,
    descripcion: s.descripcion,
    duracionMin: s.duracionMin,
  }));

// Selección curada para la vista previa del home (no todos, para no saturar).
export const serviciosDestacados = servicios.filter((s) =>
  [
    "valoracion-inicial",
    "rehabilitacion-fisica",
    "prescripcion-individual",
    "descarga-cuerpo-completo",
  ].includes(s.slug)
);

// La lógica de disponibilidad (horario laboral, almuerzo, anticipación
// mínima y sede) vive ahora en `src/lib/agenda.ts`.

// Reservas de ejemplo para el panel administrativo.
export type EstadoReserva = "confirmada" | "pendiente" | "cancelada";

export type Reserva = {
  id: string;
  cliente: string;
  telefono: string;
  servicio: string;
  sede: "Tunja" | "Turmequé";
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:mm
  estado: EstadoReserva;
  canal: "Sitio web" | "Telegram" | "Directo";
};

export const reservasEjemplo: Reserva[] = [
  { id: "1", cliente: "Ana Torres", telefono: "310 555 0142", servicio: "Valoración inicial", sede: "Tunja", fecha: "2026-09-02", hora: "09:00", estado: "confirmada", canal: "Sitio web" },
  { id: "2", cliente: "Juan Pérez", telefono: "312 555 0198", servicio: "Rehabilitación / terapia física", sede: "Tunja", fecha: "2026-09-02", hora: "11:00", estado: "confirmada", canal: "Sitio web" },
  { id: "3", cliente: "Laura Gómez", telefono: "301 555 0110", servicio: "Plan personalizado (individual)", sede: "Tunja", fecha: "2026-09-02", hora: "15:00", estado: "pendiente", canal: "Telegram" },
  { id: "4", cliente: "Carlos Ruiz", telefono: "320 555 0177", servicio: "Descarga — cuerpo completo", sede: "Turmequé", fecha: "2026-09-05", hora: "08:00", estado: "confirmada", canal: "Sitio web" },
  { id: "5", cliente: "María Díaz", telefono: "315 555 0163", servicio: "Punción seca", sede: "Tunja", fecha: "2026-09-03", hora: "14:00", estado: "cancelada", canal: "Directo" },
  { id: "6", cliente: "Andrés Camargo", telefono: "311 555 0125", servicio: "Terapia neural", sede: "Tunja", fecha: "2026-09-03", hora: "16:00", estado: "confirmada", canal: "Telegram" },
  { id: "7", cliente: "Sofía Rincón", telefono: "313 555 0189", servicio: "Sueroterapia", sede: "Turmequé", fecha: "2026-09-06", hora: "10:00", estado: "pendiente", canal: "Sitio web" },
  { id: "8", cliente: "Diego Fonseca", telefono: "318 555 0102", servicio: "Descarga — espalda", sede: "Tunja", fecha: "2026-09-04", hora: "09:00", estado: "confirmada", canal: "Sitio web" },
];

// Perfil real de la profesional (documento entregado por la clienta).
export const perfil = {
  nombreProfesional: "La Fisioterapeuta Li",
  nombreCompleto: "Lina Murillo",
  formacion: [
    "Fisioterapeuta — Universidad de Boyacá",
    "Especialización y Maestría en Neurorehabilitación (en formación) — Universidad Autónoma de Manizales",
  ],
  certificaciones: [
    "Diplomado en Terapias Alternativas — Fisioterapia en Movimiento",
    "Certificación en ATM (Articulación Temporomandibular) y Bruxismo — CAAFYR",
    "Diplomado Internacional en Rehabilitación Deportiva — CRAPTICA",
  ],
  areasEnfoque: ["Neurorrehabilitación", "Rehabilitación Deportiva"],
  sedes: [
    { nombre: "Sede Tunja (Boyacá)", horario: "Atención entre semana (lunes a viernes)" },
    { nombre: "Sede Turmequé (Boyacá)", horario: "Atención fines de semana (sábados y domingos)" },
  ],
  horarioGeneral: "Lunes a domingo, 7:00 a.m. a 8:00 p.m. (almuerzo: 12:00 p.m. a 2:00 p.m.)",
};

// Reseñas de ejemplo -- placeholder hasta tener testimonios reales de pacientes.
export type Resena = {
  nombre: string;
  calificacion: 1 | 2 | 3 | 4 | 5;
  comentario: string;
  servicio: string;
  fecha: string; // YYYY-MM-DD
  sede?: "Tunja" | "Turmequé";
};

export const resenasEjemplo: Resena[] = [
  {
    nombre: "Camila R.",
    calificacion: 5,
    comentario:
      "Llegué con dolor lumbar crónico y en pocas sesiones noté la diferencia. Lina explica cada técnica antes de aplicarla, eso me dio mucha confianza.",
    servicio: "Rehabilitación física",
    fecha: "2026-08-12",
    sede: "Tunja",
  },
  {
    nombre: "Andrés F.",
    calificacion: 5,
    comentario:
      "El plan de ejercicio personalizado se ajustó a mi horario de entrenamiento. Muy profesional y puntual en cada sesión.",
    servicio: "Prescripción de ejercicio",
    fecha: "2026-08-05",
    sede: "Tunja",
  },
  {
    nombre: "Paula M.",
    calificacion: 4,
    comentario:
      "La descarga muscular de cuerpo completo después de mi maratón fue justo lo que necesitaba para recuperarme rápido.",
    servicio: "Modulación postejercicio",
    fecha: "2026-07-28",
    sede: "Turmequé",
  },
  {
    nombre: "Diego H.",
    calificacion: 5,
    comentario:
      "La punción seca me sacó de un dolor de hombro que llevaba meses arrastrando. Explica cada paso y el procedimiento se siente seguro.",
    servicio: "Punción seca",
    fecha: "2026-07-15",
    sede: "Tunja",
  },
  {
    nombre: "Valentina S.",
    calificacion: 5,
    comentario:
      "Empecé el paquete de 10 sesiones de rehabilitación después de una cirugía de rodilla. El seguimiento sesión a sesión se nota, ajusta el plan según cómo voy avanzando.",
    servicio: "Rehabilitación física",
    fecha: "2026-07-02",
    sede: "Turmequé",
  },
  {
    nombre: "Julián P.",
    calificacion: 4,
    comentario:
      "Buena atención y puntualidad. Lo único es que a veces hay que esperar un poco si la sesión anterior se extiende.",
    servicio: "Modulación postejercicio",
    fecha: "2026-06-20",
    sede: "Tunja",
  },
  {
    nombre: "Marcela G.",
    calificacion: 5,
    comentario:
      "La sueroterapia combinada con las sesiones de rehabilitación aceleró muchísimo mi recuperación. Se nota la formación en neurorehabilitación.",
    servicio: "Sueroterapia",
    fecha: "2026-06-08",
    sede: "Tunja",
  },
];

// =====================================================================
//  Sedes y reglas de atención
//  Tunja atiende de lunes a viernes; Turmequé, sábados y domingos.
//  La regla vive en los datos (dias: convención JS, 0 = domingo).
// =====================================================================
export type Sede = {
  codigo: "TUNJA" | "TURMEQUE";
  nombre: string;
  ciudad: string;
  departamento: string;
  dias: number[]; // getDay(): 0 domingo ... 6 sábado
  nota: string;
};

export const sedes: Sede[] = [
  {
    codigo: "TUNJA",
    nombre: "Sede Tunja",
    ciudad: "Tunja",
    departamento: "Boyacá",
    dias: [1, 2, 3, 4, 5],
    nota: "Atención entre semana (lunes a viernes)",
  },
  {
    codigo: "TURMEQUE",
    nombre: "Sede Turmequé",
    ciudad: "Turmequé",
    departamento: "Boyacá",
    dias: [0, 6],
    nota: "Atención fines de semana (sábados y domingos)",
  },
];

// Minutos de preparación después de la sesión (desinfección, registro).
// Se suman a la franja que ocupa la agenda. Valores base del equipo de
// datos (db/seeds/seed.sql), por slug de servicio.
export const bufferPorServicio: Record<string, number> = {
  "valoracion-inicial": 15,
  "rehabilitacion-fisica": 15,
  "prescripcion-individual": 15,
  "descarga-espalda": 15,
  "descarga-miembros-inferiores": 15,
  "descarga-cuerpo-completo": 20,
  "puncion-seca": 20,
  "terapia-neural": 20,
  prp: 30,
  sueroterapia: 30,
};

// Indicaciones previas para el paciente (PDF §5), por categoría del catálogo.
export const indicacionesPreviasPorCategoria: Record<string, string> = {
  "valoracion-rehabilitacion":
    "Usa ropa cómoda o deportiva y calzado adecuado para ejercicio. Trae toalla personal (opcional según tu comodidad) e hidratación. Llega 5 a 10 minutos antes.",
  "prescripcion-ejercicio":
    "Usa ropa deportiva y calzado adecuado para ejercicio. Trae toalla personal (opcional) e hidratación. Llega 5 a 10 minutos antes.",
  "modulacion-postejercicio":
    "Usa ropa cómoda que facilite la aplicación de las terapias en las distintas zonas del cuerpo. Trae toalla personal (opcional) e hidratación, y llega con anticipación.",
  "procedimientos-especializados":
    "Lleva ropa holgada y cómoda para el acceso a la zona a tratar. La puntualidad es estricta para estos procedimientos.",
};

// Datos de contacto reales (documento de la clienta).
export const contacto = {
  whatsapp: "311 398 1422",
  whatsappUrl: "https://wa.me/573113981422",
  nequi: "311 398 1422 · Titular: Lina Murillo",
  horarioGeneral: perfil.horarioGeneral,
  departamento: "Boyacá, Colombia",
};

// =====================================================================
//  Catálogos para la ficha del paciente (PDF Módulos 1 y 2).
//  Cada lista termina en "Otro" -> el formulario muestra un campo libre.
// =====================================================================
export const OTRO = "Otro";

export const tiposDocumento = [
  "C.C.",
  "T.I.",
  "C.E.",
  "Pasaporte",
  "PPT",
];

export const generos = ["Femenino", "Masculino", "Otro", "Prefiero no decir"];

export const epsOpciones = [
  "Sura",
  "Sanitas",
  "Compensar",
  "Nueva EPS",
  "Salud Total",
  "Capital Salud",
  "Famisanar",
  "Coosalud",
  "SOS",
  "PME (Fuerzas Militares/Policía)",
  "Particular / Ninguna",
  OTRO,
];

export const ciudadesResidencia = [
  "Tunja",
  "Turmequé",
  "Bogotá",
  "Duitama",
  "Sogamoso",
  "Ventaquemada",
  "Samacá",
  OTRO,
];

export const ocupaciones = [
  "Sedentaria / Oficina",
  "Deportista de alto rendimiento",
  "Amateur / Recreativo",
  "Trabajo físico pesado",
  "Estudiante",
  "Hogar",
  OTRO,
];

export const parentescos = [
  "Padre / Madre",
  "Hijo / Hija",
  "Cónyuge / Pareja",
  "Hermano / Hermana",
  "Otro familiar",
  "Amigo / Amiga",
  OTRO,
];

export const motivosConsulta = [
  "Dolor agudo / crónico",
  "Recuperación postquirúrgica",
  "Lesión deportiva / Sobrecarga muscular",
  "Mantenimiento / Descarga postentrenamiento",
  "Problema postural / Ergonomía",
  "Disfunción articular (ATM, rodilla, hombro, etc.)",
  "Condición neurológica",
];

// =====================================================================
//  Pacientes de ejemplo para el panel administrativo (solo lectura).
// =====================================================================
export type PacienteEjemplo = {
  id: string;
  nombre: string;
  documento: string;
  telefono: string;
  email: string;
  ciudad: string;
  eps: string;
  ocupacion: string;
  contactoEmergencia: string;
  referido?: string;
  referidosEfectivos: number; // 0..5 -> a los 5 aplica 10% OFF
  ultimaSesion: string;
};

export const pacientesEjemplo: PacienteEjemplo[] = [
  {
    id: "p1",
    nombre: "Ana Torres",
    documento: "C.C. 1.052.884.331",
    telefono: "310 555 0142",
    email: "ana.torres@correo.com",
    ciudad: "Tunja",
    eps: "Sanitas",
    ocupacion: "Sedentaria / Oficina",
    contactoEmergencia: "Pedro Torres (Padre) · 310 555 0100",
    referido: "Instagram",
    referidosEfectivos: 2,
    ultimaSesion: "2026-09-02",
  },
  {
    id: "p2",
    nombre: "Juan Pérez",
    documento: "C.C. 7.184.559.021",
    telefono: "312 555 0198",
    email: "juanp@correo.com",
    ciudad: "Tunja",
    eps: "Nueva EPS",
    ocupacion: "Trabajo físico pesado",
    contactoEmergencia: "Marta Ruiz (Cónyuge) · 312 555 0190",
    referidosEfectivos: 5,
    ultimaSesion: "2026-09-02",
  },
  {
    id: "p3",
    nombre: "Laura Gómez",
    documento: "C.C. 1.049.221.907",
    telefono: "301 555 0110",
    email: "lauragomez@correo.com",
    ciudad: "Bogotá",
    eps: "Compensar",
    ocupacion: "Deportista de alto rendimiento",
    contactoEmergencia: "Carla Gómez (Hermana) · 301 555 0111",
    referido: "Camila R.",
    referidosEfectivos: 1,
    ultimaSesion: "2026-09-02",
  },
  {
    id: "p4",
    nombre: "Carlos Ruiz",
    documento: "C.C. 4.552.108.774",
    telefono: "320 555 0177",
    email: "carlos.ruiz@correo.com",
    ciudad: "Turmequé",
    eps: "Particular / Ninguna",
    ocupacion: "Amateur / Recreativo",
    contactoEmergencia: "Luisa Peña (Pareja) · 320 555 0170",
    referidosEfectivos: 0,
    ultimaSesion: "2026-09-05",
  },
  {
    id: "p5",
    nombre: "Sofía Rincón",
    documento: "C.C. 1.007.663.412",
    telefono: "313 555 0189",
    email: "sofia.rincon@correo.com",
    ciudad: "Samacá",
    eps: "Salud Total",
    ocupacion: "Estudiante",
    contactoEmergencia: "Jorge Rincón (Padre) · 313 555 0180",
    referidosEfectivos: 3,
    ultimaSesion: "2026-09-06",
  },
];

// =====================================================================
//  Registro de operaciones administrativas (operacion_log).
// =====================================================================
export type OperacionLog = {
  id: string;
  fechaHora: string; // ISO
  actor: string;
  canal: "Sitio web" | "Telegram" | "Panel" | "n8n";
  accion: string;
  detalle: string;
  resultado: "ok" | "error" | "pendiente";
};

export const operacionesEjemplo: OperacionLog[] = [
  { id: "o1", fechaHora: "2026-09-03T08:12:00-05:00", actor: "Sitio web", canal: "Sitio web", accion: "Reserva creada", detalle: "Ana Torres · Valoración inicial · Tunja · 04 sep 09:00", resultado: "ok" },
  { id: "o2", fechaHora: "2026-09-03T08:12:04-05:00", actor: "n8n", canal: "n8n", accion: "Correo de confirmación", detalle: "Enviado a ana.torres@correo.com", resultado: "ok" },
  { id: "o3", fechaHora: "2026-09-03T09:40:00-05:00", actor: "Lina Murillo", canal: "Telegram", accion: "Consulta de agenda", detalle: "\"Muéstrame las sesiones de mañana\"", resultado: "ok" },
  { id: "o4", fechaHora: "2026-09-03T10:05:00-05:00", actor: "Lina Murillo", canal: "Telegram", accion: "Cita reagendada", detalle: "Laura Gómez · 02 sep 15:00 → 04 sep 16:00", resultado: "ok" },
  { id: "o5", fechaHora: "2026-09-03T11:22:00-05:00", actor: "n8n", canal: "n8n", accion: "Sincronización Google Calendar", detalle: "Evento no creado: token expirado", resultado: "error" },
  { id: "o6", fechaHora: "2026-09-03T12:00:00-05:00", actor: "Sistema", canal: "Panel", accion: "Reserva expirada", detalle: "María Díaz · Punción seca · sin pago en 2 h", resultado: "ok" },
  { id: "o7", fechaHora: "2026-09-03T14:30:00-05:00", actor: "Lina Murillo", canal: "Telegram", accion: "Carpeta creada en Drive", detalle: "Administración / Facturación / Septiembre 2026", resultado: "ok" },
  { id: "o8", fechaHora: "2026-09-03T16:45:00-05:00", actor: "n8n", canal: "n8n", accion: "Recordatorio de sesión", detalle: "Programado para Carlos Ruiz · 24 h antes", resultado: "pendiente" },
];

// =====================================================================
//  Estado de integraciones (Google Workspace, IA local, canales).
// =====================================================================
export type Integracion = {
  id: string;
  nombre: string;
  descripcion: string;
  estado: "conectado" | "requiere_atencion" | "no_configurado";
  detalle: string;
  ultimoEvento?: string;
};

export const integracionesEjemplo: Integracion[] = [
  { id: "calendar", nombre: "Google Calendar", descripcion: "Espejo de la agenda confirmada", estado: "requiere_atencion", detalle: "Token de acceso expirado — reconectar cuenta", ultimoEvento: "Hace 3 h" },
  { id: "gmail", nombre: "Gmail", descripcion: "Confirmaciones, recordatorios y notificaciones", estado: "conectado", detalle: "Enviando desde lina@fisioterapeutali.com", ultimoEvento: "Hace 12 min" },
  { id: "drive", nombre: "Google Drive", descripcion: "Archivo documental de la empresa", estado: "conectado", detalle: "Estructura: Administración · Finanzas · Clientes · Servicios · Marketing · Plantillas", ultimoEvento: "Hace 1 h" },
  { id: "sheets", nombre: "Google Sheets", descripcion: "Reportes de citas e ingresos", estado: "conectado", detalle: "Hoja \"Reportes Fisio-Li 2026\"", ultimoEvento: "Hoy 07:00" },
  { id: "telegram", nombre: "Bot de Telegram", descripcion: "Canal conversacional del administrador", estado: "conectado", detalle: "1 chat autorizado · long polling activo", ultimoEvento: "Hace 5 min" },
  { id: "ollama", nombre: "Modelo de IA local (Ollama)", descripcion: "Interpretación de lenguaje natural", estado: "conectado", detalle: "llama3.1:8b · responde en ~1.4 s", ultimoEvento: "Hace 5 min" },
  { id: "n8n", nombre: "n8n", descripcion: "Orquestación de flujos", estado: "conectado", detalle: "8 workflows activos", ultimoEvento: "Hace 2 min" },
];

// =====================================================================
//  Automatizaciones (workflows de n8n) — vista de control.
// =====================================================================
export type Automatizacion = {
  id: string;
  nombre: string;
  descripcion: string;
  disparador: string;
  activa: boolean;
  ultimaEjecucion: string;
  ejecuciones7d: number;
  fallos7d: number;
};

export const automatizacionesEjemplo: Automatizacion[] = [
  { id: "a1", nombre: "Confirmación de reserva", descripcion: "Envía correo al paciente cuando se crea una cita", disparador: "Reserva creada", activa: true, ultimaEjecucion: "Hace 12 min", ejecuciones7d: 34, fallos7d: 0 },
  { id: "a2", nombre: "Recordatorio 24 h antes", descripcion: "Correo y mensaje de Telegram previos a la sesión", disparador: "Programado · diario 18:00", activa: true, ultimaEjecucion: "Ayer 18:00", ejecuciones7d: 7, fallos7d: 0 },
  { id: "a3", nombre: "Aviso de cancelación", descripcion: "Notifica al administrador por Telegram", disparador: "Reserva cancelada", activa: true, ultimaEjecucion: "Hace 3 h", ejecuciones7d: 4, fallos7d: 0 },
  { id: "a4", nombre: "Volcado a Google Sheets", descripcion: "Agrega la cita al reporte mensual", disparador: "Reserva confirmada", activa: true, ultimaEjecucion: "Hoy 07:00", ejecuciones7d: 30, fallos7d: 1 },
  { id: "a5", nombre: "Expirar reservas sin pago", descripcion: "Libera el cupo si no hay pago en 2 h", disparador: "Programado · cada 15 min", activa: true, ultimaEjecucion: "Hace 6 min", ejecuciones7d: 672, fallos7d: 0 },
  { id: "a6", nombre: "Clasificación de documentos en Drive", descripcion: "Mueve archivos nuevos a su carpeta según reglas", disparador: "Archivo nuevo en /Entrada", activa: false, ultimaEjecucion: "Hace 2 días", ejecuciones7d: 0, fallos7d: 0 },
  { id: "a7", nombre: "Descuento por referidos", descripcion: "Marca 10% OFF al llegar a 5 referidos efectivos", disparador: "Referido registrado", activa: true, ultimaEjecucion: "Hace 1 día", ejecuciones7d: 2, fallos7d: 0 },
  { id: "a8", nombre: "Reporte semanal", descripcion: "Resumen de citas e ingresos al correo de Lina", disparador: "Programado · lunes 07:00", activa: true, ultimaEjecucion: "Lun 07:00", ejecuciones7d: 1, fallos7d: 0 },
];

// =====================================================================
//  Indicadores del negocio (KPIs del panel).
// =====================================================================
export const indicadores = {
  citasSemana: 18,
  citasSemanaPrev: 14,
  ingresosMes: 4180000, // COP, estimado
  ingresosMesPrev: 3560000,
  ocupacion: 0.62, // 0..1
  ocupacionPrev: 0.54,
  nuevosPacientes: 5,
  nuevosPacientesPrev: 3,
  // Distribución de citas por servicio (últimos 30 días)
  citasPorServicio: [
    { servicio: "Rehabilitación / terapia física", valor: 22 },
    { servicio: "Prescripción de ejercicio", valor: 15 },
    { servicio: "Descargas musculares", valor: 12 },
    { servicio: "Valoración inicial", valor: 9 },
    { servicio: "Procedimientos especializados", valor: 6 },
  ],
  // Reservas por canal (últimos 30 días)
  reservasPorCanal: [
    { canal: "Sitio web", valor: 38 },
    { canal: "Telegram", valor: 21 },
    { canal: "Directo", valor: 5 },
  ],
  // Citas por día de la semana actual
  citasPorDia: [
    { dia: "Lun", valor: 4 },
    { dia: "Mar", valor: 3 },
    { dia: "Mié", valor: 5 },
    { dia: "Jue", valor: 2 },
    { dia: "Vie", valor: 4 },
    { dia: "Sáb", valor: 3 },
    { dia: "Dom", valor: 2 },
  ],
};
