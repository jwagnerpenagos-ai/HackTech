-- =====================================================================
--  FISIO-LI  ·  Esquema de base de datos
--  Plataforma de automatización y gestión — La Fisioterapeuta Li
--  HackTech 5.0 · Universidad Santo Tomás, Tunja
--
--  Motor: PostgreSQL 16
--  Zona horaria de negocio: America/Bogota
--
--  PRINCIPIOS QUE GOBIERNAN ESTE DISEÑO
--  1. PostgreSQL es la única fuente de verdad. Google Workspace es
--     espejo de lectura: se escribe hacia allá, nunca se lee de allá
--     para decidir nada.
--  2. Los saldos y los estados clínicos no se almacenan, se derivan.
--  3. El doble agendamiento se impide en el motor, no en la aplicación.
--  4. El modelo de IA no tiene credenciales ni acceso a este esquema.
--  5. n8n no contiene lógica de negocio: sólo invoca funciones y lee
--     vistas expuestas para él.
-- =====================================================================

SET client_min_messages = warning;

-- ---------------------------------------------------------------------
-- 0. EXTENSIONES
-- ---------------------------------------------------------------------

-- btree_gist permite mezclar operadores de igualdad (=) con operadores
-- de solapamiento (&&) dentro de una misma restricción EXCLUDE. Sin
-- esta extensión la garantía anti-doble-reserva no es posible.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- gen_random_uuid() para identificadores públicos no adivinables.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Búsqueda de pacientes por nombre tolerante a errores de digitación,
-- necesaria porque el bot recibe nombres escritos a mano por el paciente.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() se declara STABLE porque depende de un diccionario que
-- podría recargarse. Para poder indexar por él hace falta una envoltura
-- que fije el diccionario y sea IMMUTABLE.
CREATE OR REPLACE FUNCTION public.sin_tildes(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$fn$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $fn$;

-- ---------------------------------------------------------------------
-- 1. ESQUEMAS
--    La separación por esquemas no es cosmética: es la unidad de
--    permisos. El rol de n8n jamás recibe acceso a `clinico`.
-- ---------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS catalogo;     -- Datos maestros editables
CREATE SCHEMA IF NOT EXISTS personas;     -- Pacientes y profesionales
CREATE SCHEMA IF NOT EXISTS agenda;       -- Tiempo, citas y bloqueos
CREATE SCHEMA IF NOT EXISTS comercial;    -- Compras, pagos, beneficios
CREATE SCHEMA IF NOT EXISTS clinico;      -- Historia clínica
CREATE SCHEMA IF NOT EXISTS integracion;  -- Google Workspace, IA, canales

COMMENT ON SCHEMA catalogo    IS 'Datos maestros que la profesional edita sin intervención de desarrollo.';
COMMENT ON SCHEMA personas    IS 'Identidad de pacientes y profesionales. Contiene datos personales.';
COMMENT ON SCHEMA agenda      IS 'Todo lo que ocupa tiempo del profesional. Fuente de verdad del calendario.';
COMMENT ON SCHEMA comercial   IS 'Compras de paquetes, pagos, convenios y beneficios.';
COMMENT ON SCHEMA clinico     IS 'Historia clínica. Datos sensibles, acceso restringido, append-only.';
COMMENT ON SCHEMA integracion IS 'Salida hacia Google Workspace, trazabilidad de IA y canales de contacto.';

-- ---------------------------------------------------------------------
-- 2. ROLES DE APLICACIÓN
--    Cada componente del sistema entra con un rol distinto y con el
--    mínimo privilegio que necesita. Los GRANT están al final del
--    archivo, después de que existan los objetos.
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fisio_core') THEN
    CREATE ROLE fisio_core NOLOGIN;   -- API central: lectura y escritura completa
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fisio_n8n') THEN
    CREATE ROLE fisio_n8n NOLOGIN;    -- Orquestador: vistas y funciones, cero DML directo
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fisio_web') THEN
    CREATE ROLE fisio_web NOLOGIN;    -- Front público: reserva y consulta, sin clínico
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fisio_reportes') THEN
    CREATE ROLE fisio_reportes NOLOGIN; -- Volcado a Google Sheets: sólo vistas planas
  END IF;
END
$$;

-- =====================================================================
--  DOMINIO 1 · CATALOGO
--  Todo desplegable de la especificación que termina en "Otro" vive
--  aquí como tabla, no como ENUM. Lina debe poder agregar una EPS sin
--  que nadie ejecute una migración.
-- =====================================================================

CREATE TABLE catalogo.parametro (
    clave           text PRIMARY KEY,
    valor           text        NOT NULL,
    descripcion     text        NOT NULL,
    actualizado_en  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE catalogo.parametro IS
  'Reglas de negocio numéricas que la profesional puede ajustar: ventana de cancelación, abono mínimo de convenios, referidos requeridos.';

CREATE TABLE catalogo.sede (
    id                  smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo              text        NOT NULL UNIQUE,
    nombre              text        NOT NULL,
    ciudad              text        NOT NULL,
    departamento        text        NOT NULL DEFAULT 'Boyacá',
    direccion           text,
    zona_horaria        text        NOT NULL DEFAULT 'America/Bogota',
    -- Identificador del calendario de Google Workspace que refleja esta
    -- sede. Nulo mientras la integración no esté aprovisionada.
    google_calendar_id  text UNIQUE,
    -- Carpeta de Drive donde se archivan documentos originados en esta sede.
    google_drive_folder_id text,
    activo              boolean     NOT NULL DEFAULT true,
    creado_en           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalogo.categoria_servicio (
    id       smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo   text NOT NULL UNIQUE,
    nombre   text NOT NULL,
    orden    smallint NOT NULL DEFAULT 0
);

CREATE TABLE catalogo.servicio (
    id                      smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    categoria_id            smallint NOT NULL REFERENCES catalogo.categoria_servicio(id),
    codigo                  text     NOT NULL UNIQUE,
    nombre                  text     NOT NULL,
    descripcion             text,

    -- Terapia Neural y PRP duran "1 a 2 horas". El rango es real y
    -- afecta cuánto tiempo se bloquea la agenda, así que se modela.
    duracion_min_minutos    integer  NOT NULL CHECK (duracion_min_minutos > 0),
    duracion_max_minutos    integer  NOT NULL CHECK (duracion_max_minutos > 0),

    -- Tiempo entre pacientes: desinfectar camilla, cambiar sábanas,
    -- guardar equipo y registrar notas. Es distinto por servicio y
    -- entra en la franja que bloquea la agenda.
    buffer_previo_minutos   integer  NOT NULL DEFAULT 0  CHECK (buffer_previo_minutos  >= 0),
    buffer_posterior_minutos integer NOT NULL DEFAULT 15 CHECK (buffer_posterior_minutos >= 0),

    requiere_valoracion_previa boolean NOT NULL DEFAULT false,
    permite_grupal          boolean  NOT NULL DEFAULT false,
    requiere_consentimiento_informado boolean NOT NULL DEFAULT false,
    indicaciones_previas    text,
    activo                  boolean  NOT NULL DEFAULT true,

    CONSTRAINT servicio_duracion_coherente CHECK (duracion_max_minutos >= duracion_min_minutos)
);
COMMENT ON COLUMN catalogo.servicio.buffer_posterior_minutos IS
  'Minutos de preparación después de la sesión. Se suma a la franja de bloqueo, nunca a la franja clínica.';

CREATE TABLE catalogo.zona_anatomica (
    id      smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo  text NOT NULL UNIQUE,
    nombre  text NOT NULL
);

CREATE TABLE catalogo.servicio_zona (
    servicio_id smallint NOT NULL REFERENCES catalogo.servicio(id) ON DELETE CASCADE,
    zona_id     smallint NOT NULL REFERENCES catalogo.zona_anatomica(id),
    condicionada boolean NOT NULL DEFAULT false,
    nota        text,
    PRIMARY KEY (servicio_id, zona_id)
);
COMMENT ON COLUMN catalogo.servicio_zona.condicionada IS
  'Marca zonas incluidas sólo con conformidad expresa del paciente, como los glúteos en cuerpo completo.';

CREATE TABLE catalogo.tecnica (
    id      smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo  text NOT NULL UNIQUE,
    nombre  text NOT NULL
);

CREATE TABLE catalogo.servicio_tecnica (
    servicio_id smallint NOT NULL REFERENCES catalogo.servicio(id) ON DELETE CASCADE,
    tecnica_id  smallint NOT NULL REFERENCES catalogo.tecnica(id),
    PRIMARY KEY (servicio_id, tecnica_id)
);

-- ---------------------------------------------------------------------
-- Tarifas con vigencia.
-- Un servicio es "Punción Seca". Una tarifa es "Punción Seca, 10
-- sesiones, $950.000, vigente desde el 1 de enero". El precio por
-- sesión NO se guarda: es una división.
-- ---------------------------------------------------------------------

CREATE TABLE catalogo.tarifa (
    id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    servicio_id         smallint NOT NULL REFERENCES catalogo.servicio(id),
    nombre              text     NOT NULL,
    sesiones_incluidas  smallint NOT NULL CHECK (sesiones_incluidas >= 1),
    -- Personas que caben en la sesión, no divisor del precio.
    cupo_personas       smallint NOT NULL DEFAULT 1 CHECK (cupo_personas >= 1),
    -- Lo que paga UNA persona por el paquete completo. En los planes
    -- grupales el catálogo de la clienta también está expresado por
    -- persona: $150.000 p/p por 4 sesiones, no $150.000 entre cuatro.
    valor_total         numeric(12,2) NOT NULL CHECK (valor_total >= 0),
    moneda              char(3)  NOT NULL DEFAULT 'COP',

    -- Vigencia como rango: permite subir precios en enero sin destruir
    -- el histórico ni tocar las compras ya realizadas.
    vigencia            daterange NOT NULL DEFAULT daterange(CURRENT_DATE, NULL, '[)'),
    activo              boolean  NOT NULL DEFAULT true,

    -- No pueden existir dos tarifas vigentes al mismo tiempo para la
    -- misma combinación de servicio, número de sesiones y cupo. Si eso
    -- pasara, el sistema no sabría qué precio cobrar.
    CONSTRAINT tarifa_vigencia_sin_solape EXCLUDE USING gist (
        servicio_id        WITH =,
        sesiones_incluidas WITH =,
        cupo_personas      WITH =,
        vigencia           WITH &&
    ) WHERE (activo)
);

CREATE INDEX tarifa_servicio_idx ON catalogo.tarifa (servicio_id) WHERE activo;

-- Vista de conveniencia: el valor por sesión y por persona, derivado.
CREATE VIEW catalogo.v_tarifa_vigente AS
SELECT
    t.id                AS tarifa_id,
    s.id                AS servicio_id,
    s.codigo            AS servicio_codigo,
    s.nombre            AS servicio_nombre,
    c.nombre            AS categoria,
    t.nombre            AS tarifa_nombre,
    t.sesiones_incluidas,
    t.cupo_personas,
    t.valor_total                                        AS valor_por_persona,
    round(t.valor_total / t.sesiones_incluidas, 2)       AS valor_por_sesion_por_persona,
    t.valor_total * t.cupo_personas                      AS valor_grupo_completo,
    s.duracion_min_minutos,
    s.duracion_max_minutos,
    s.indicaciones_previas
FROM catalogo.tarifa t
JOIN catalogo.servicio s           ON s.id = t.servicio_id
JOIN catalogo.categoria_servicio c ON c.id = s.categoria_id
WHERE t.activo
  AND s.activo
  AND t.vigencia @> CURRENT_DATE;

COMMENT ON VIEW catalogo.v_tarifa_vigente IS
  'Catálogo comercial listo para el bot y la web. Es la única fuente de precios que deben consultar los canales.';

-- ---------------------------------------------------------------------
-- Catálogos de la ficha del paciente (Módulo 1 y 2 de la especificación)
-- ---------------------------------------------------------------------

CREATE TABLE catalogo.tipo_documento (
    id     smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo text NOT NULL UNIQUE,
    nombre text NOT NULL
);

CREATE TABLE catalogo.eps (
    id      smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  text NOT NULL UNIQUE,
    activo  boolean NOT NULL DEFAULT true,
    orden   smallint NOT NULL DEFAULT 0
);

CREATE TABLE catalogo.ciudad (
    id      smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  text NOT NULL UNIQUE,
    activo  boolean NOT NULL DEFAULT true,
    orden   smallint NOT NULL DEFAULT 0
);

CREATE TABLE catalogo.ocupacion (
    id      smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  text NOT NULL UNIQUE,
    activo  boolean NOT NULL DEFAULT true,
    orden   smallint NOT NULL DEFAULT 0
);

CREATE TABLE catalogo.motivo_consulta (
    id      smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  text NOT NULL UNIQUE,
    activo  boolean NOT NULL DEFAULT true,
    orden   smallint NOT NULL DEFAULT 0
);

CREATE TABLE catalogo.antecedente (
    id             smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo         text NOT NULL UNIQUE,
    nombre         text NOT NULL,
    -- Antecedentes que contraindican o exigen precaución en punción
    -- seca, terapia neural y PRP. El sistema debe alertar, no decidir.
    es_bandera_roja boolean NOT NULL DEFAULT false,
    activo         boolean NOT NULL DEFAULT true,
    orden          smallint NOT NULL DEFAULT 0
);

CREATE TABLE catalogo.tipo_dolor (
    id     smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo text NOT NULL UNIQUE,
    nombre text NOT NULL
);

CREATE TABLE catalogo.medio_pago (
    id                smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo            text NOT NULL UNIQUE,
    nombre            text NOT NULL,
    requiere_referencia boolean NOT NULL DEFAULT false,
    activo            boolean NOT NULL DEFAULT true
);

-- =====================================================================
--  DOMINIO 2 · PERSONAS
-- =====================================================================

CREATE TABLE personas.profesional (
    id                 smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombres            text NOT NULL,
    apellidos          text NOT NULL,
    nombre_publico     text NOT NULL,
    registro_profesional text,
    telefono           text,
    -- Cuenta de Google Workspace. Es el propietario de los calendarios
    -- y el remitente de los correos que envía el sistema.
    email_workspace    text UNIQUE,
    google_calendar_id text UNIQUE,
    activo             boolean NOT NULL DEFAULT true,
    creado_en          timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE personas.genero AS ENUM ('femenino','masculino','otro','no_declara');

CREATE TABLE personas.paciente (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Identificador público para enlaces y QR. No expone el conteo de
    -- pacientes ni permite enumerar historias clínicas.
    uuid                uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    tipo_documento_id   smallint REFERENCES catalogo.tipo_documento(id),
    numero_documento    text,

    nombres             text NOT NULL,
    apellidos           text NOT NULL,
    fecha_nacimiento    date CHECK (fecha_nacimiento <= CURRENT_DATE),
    genero              personas.genero,

    telefono            text,
    email               text,

    -- Patrón "desplegable + Otro": la referencia al catálogo es
    -- opcional y el texto libre la complementa. La restricción impide
    -- que queden ambos llenos o ambos vacíos de forma inconsistente.
    ciudad_id           smallint REFERENCES catalogo.ciudad(id),
    ciudad_otro         text,
    ocupacion_id        smallint REFERENCES catalogo.ocupacion(id),
    ocupacion_otro      text,
    eps_id              smallint REFERENCES catalogo.eps(id),
    eps_otro            text,

    -- Programa de referidos: autorreferencia. codigo_referido lo llena solo
    -- el trigger personas.generar_codigo_referido (ver más abajo) — nunca se
    -- inserta a mano, así que cualquier vía de alta de paciente (web, bot,
    -- panel) lo obtiene gratis sin tener que acordarse de generarlo.
    referido_por_paciente_id bigint REFERENCES personas.paciente(id),
    referido_texto_libre     text,
    codigo_referido          text NOT NULL,

    -- Espejo en Google Contacts del Workspace de Lina.
    google_contact_id   text UNIQUE,

    activo              boolean NOT NULL DEFAULT true,
    creado_en           timestamptz NOT NULL DEFAULT now(),
    actualizado_en      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT paciente_documento_unico UNIQUE (tipo_documento_id, numero_documento),
    CONSTRAINT paciente_ciudad_coherente    CHECK (NOT (ciudad_id    IS NOT NULL AND ciudad_otro    IS NOT NULL)),
    CONSTRAINT paciente_ocupacion_coherente CHECK (NOT (ocupacion_id IS NOT NULL AND ocupacion_otro IS NOT NULL)),
    CONSTRAINT paciente_eps_coherente       CHECK (NOT (eps_id       IS NOT NULL AND eps_otro       IS NOT NULL)),
    CONSTRAINT paciente_no_se_refiere_a_si_mismo CHECK (referido_por_paciente_id IS DISTINCT FROM id),
    CONSTRAINT paciente_codigo_referido_unico UNIQUE (codigo_referido)
);

-- Genera codigo_referido (4 letras del nombre + id) si no viene ya puesto.
-- BEFORE INSERT porque el valor de identidad de NEW.id ya está resuelto en
-- esta etapa, antes de que corran las restricciones de la fila.
CREATE OR REPLACE FUNCTION personas.generar_codigo_referido() RETURNS trigger AS $$
BEGIN
  IF NEW.codigo_referido IS NULL THEN
    NEW.codigo_referido := upper(left(regexp_replace(public.sin_tildes(NEW.nombres), '[^A-Za-z]', '', 'g') || 'REF', 4)) || lpad(NEW.id::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER paciente_codigo_referido_trigger
  BEFORE INSERT ON personas.paciente
  FOR EACH ROW EXECUTE FUNCTION personas.generar_codigo_referido();

CREATE INDEX paciente_nombre_trgm_idx ON personas.paciente
    USING gin ((public.sin_tildes(lower(nombres || ' ' || apellidos))) gin_trgm_ops);
CREATE INDEX paciente_telefono_idx ON personas.paciente (telefono);
CREATE INDEX paciente_referente_idx ON personas.paciente (referido_por_paciente_id)
    WHERE referido_por_paciente_id IS NOT NULL;

COMMENT ON COLUMN personas.paciente.referido_texto_libre IS
  'Nombre que el paciente escribió cuando el referente aún no se puede resolver a un registro. Se concilia después.';

CREATE TABLE personas.contacto_emergencia (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    paciente_id bigint NOT NULL REFERENCES personas.paciente(id) ON DELETE CASCADE,
    nombre      text NOT NULL,
    parentesco  text NOT NULL,
    telefono    text NOT NULL,
    principal   boolean NOT NULL DEFAULT true
);

-- Sólo un contacto de emergencia principal por paciente.
CREATE UNIQUE INDEX contacto_emergencia_principal_unico
    ON personas.contacto_emergencia (paciente_id) WHERE principal;

CREATE TYPE personas.tipo_consentimiento AS ENUM (
    'tratamiento_datos',      -- Habeas data, Ley 1581 de 2012
    'consentimiento_informado',
    'uso_imagen',
    'comunicaciones'
);

CREATE TABLE personas.consentimiento (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    paciente_id    bigint NOT NULL REFERENCES personas.paciente(id) ON DELETE CASCADE,
    tipo           personas.tipo_consentimiento NOT NULL,
    version_texto  text NOT NULL,
    otorgado       boolean NOT NULL,
    canal          text NOT NULL,
    otorgado_en    timestamptz NOT NULL DEFAULT now(),
    revocado_en    timestamptz,
    -- Copia firmada o registro escaneado archivado en Drive.
    google_drive_file_id text
);

CREATE INDEX consentimiento_paciente_idx ON personas.consentimiento (paciente_id, tipo);

-- Vinculación con Telegram. El chat_id es la identidad del canal; el
-- paciente es la identidad del negocio. Nunca se mezclan.
CREATE TABLE personas.vinculo_telegram (
    chat_id       bigint PRIMARY KEY,
    paciente_id   bigint REFERENCES personas.paciente(id) ON DELETE SET NULL,
    username      text,
    nombre_reportado text,
    verificado_en timestamptz,
    bloqueado     boolean NOT NULL DEFAULT false,
    creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vinculo_telegram_paciente_idx ON personas.vinculo_telegram (paciente_id);

COMMENT ON TABLE personas.vinculo_telegram IS
  'Un chat sin paciente vinculado es un desconocido: puede consultar el catálogo pero no ver ni agendar nada a nombre de otro.';

-- Autorización OPCIONAL de un paciente para que su cita se agregue a su
-- propio Google Calendar (distinta del calendario de la sede, que se
-- sincroniza siempre vía integracion.outbox). El paciente da su
-- consentimiento por fuera de la base (OAuth con Google); acá solo se
-- guarda el resultado. La agrega/gestiona services/google-adapter, nunca
-- core-api directamente (regla del README: solo google-adapter tiene
-- credenciales OAuth).
CREATE TABLE personas.autorizacion_calendar_paciente (
    paciente_id   bigint PRIMARY KEY REFERENCES personas.paciente(id) ON DELETE CASCADE,
    access_token  text NOT NULL,
    refresh_token text NOT NULL,
    scope         text NOT NULL,
    expira_en     timestamptz,
    otorgado_en   timestamptz NOT NULL DEFAULT now(),
    revocado_en   timestamptz
);

-- Edad calculada, nunca almacenada.
CREATE VIEW personas.v_paciente AS
SELECT
    p.id,
    p.uuid,
    p.nombres || ' ' || p.apellidos                              AS nombre_completo,
    td.codigo                                                    AS tipo_documento,
    p.numero_documento,
    p.fecha_nacimiento,
    date_part('year', age(p.fecha_nacimiento))::integer          AS edad,
    p.genero,
    p.telefono,
    p.email,
    coalesce(c.nombre, p.ciudad_otro)                            AS ciudad,
    coalesce(o.nombre, p.ocupacion_otro)                         AS ocupacion,
    coalesce(e.nombre, p.eps_otro)                               AS eps,
    p.referido_por_paciente_id,
    p.activo,
    p.creado_en
FROM personas.paciente p
LEFT JOIN catalogo.tipo_documento td ON td.id = p.tipo_documento_id
LEFT JOIN catalogo.ciudad    c ON c.id = p.ciudad_id
LEFT JOIN catalogo.ocupacion o ON o.id = p.ocupacion_id
LEFT JOIN catalogo.eps       e ON e.id = p.eps_id;

-- =====================================================================
--  DOMINIO 3 · AGENDA
--  El corazón del sistema. Una sola tabla física para todo lo que
--  ocupa tiempo, porque la restricción de exclusión sólo puede operar
--  dentro de una tabla. Si se separaran citas y bloqueos, el invariante
--  dejaría de ser una garantía del motor y pasaría a ser código que
--  puede fallar.
-- =====================================================================

CREATE TYPE agenda.tipo_reserva AS ENUM (
    'cita',            -- Atención a uno o varios pacientes
    'bloqueo',         -- Vacaciones, festivo, personal, desplazamiento entre sedes
    'evento_convenio'  -- Jornada con club o equipo deportivo
);

CREATE TYPE agenda.estado_reserva AS ENUM (
    'propuesta',        -- Sugerida por la IA, no reserva el cupo todavía
    'pendiente_pago',   -- Cupo tomado, esperando el 100% anticipado
    'confirmada',       -- Pago verificado
    'en_curso',
    'atendida',
    'no_asistio',       -- Inasistencia: la cita se da por realizada
    'cancelada_tarde',  -- Cancelada fuera de plazo: la cita se da por realizada
    'cancelada_a_tiempo',
    'expirada',         -- Nunca se pagó dentro de la ventana de retención
    'rechazada'         -- Propuesta de IA descartada
);

-- 'email' no es un origen real de reserva (nadie agenda por correo), pero
-- esta misma enumeración se reutiliza como "canal de mensaje" en
-- integracion.notificacion/mensaje_canal/propuesta_ia, y ahí sí aplica.
CREATE TYPE agenda.canal_origen AS ENUM ('telegram','web','presencial','whatsapp','admin','email');

CREATE TABLE agenda.horario_atencion (
    id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profesional_id smallint NOT NULL REFERENCES personas.profesional(id),
    sede_id        smallint NOT NULL REFERENCES catalogo.sede(id),
    -- Convención de PostgreSQL: 0 = domingo ... 6 = sábado.
    dia_semana     smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora_inicio    time NOT NULL,
    hora_fin       time NOT NULL,
    vigente_desde  date NOT NULL DEFAULT CURRENT_DATE,
    vigente_hasta  date,
    CONSTRAINT horario_coherente CHECK (hora_fin > hora_inicio)
);

CREATE INDEX horario_lookup_idx ON agenda.horario_atencion (profesional_id, dia_semana, sede_id);

COMMENT ON TABLE agenda.horario_atencion IS
  'La franja de almuerzo no es un campo: es la ausencia de fila entre 12:00 y 14:00. Cada día hábil se representa con dos filas. Que Tunja sea entre semana y Turmequé fin de semana queda expresado en datos, no en código.';

CREATE TABLE agenda.reserva (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uuid              uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    tipo              agenda.tipo_reserva  NOT NULL DEFAULT 'cita',
    estado            agenda.estado_reserva NOT NULL DEFAULT 'pendiente_pago',

    profesional_id    smallint NOT NULL REFERENCES personas.profesional(id),
    sede_id           smallint NOT NULL REFERENCES catalogo.sede(id),
    servicio_id       smallint REFERENCES catalogo.servicio(id),

    -- La franja clínica es el tiempo que el paciente está en terapia.
    -- La franja de bloqueo la contiene e incluye la preparación previa
    -- y posterior. La restricción de exclusión opera sobre la SEGUNDA:
    -- comparar sólo la hora clínica permitiría agendar dos pacientes
    -- espalda contra espalda sin margen de desinfección.
    franja_clinica    tstzrange NOT NULL,
    franja_bloqueo    tstzrange NOT NULL,

    -- Cupo de la sesión. 1 para individual; 4 u 8 para los planes
    -- grupales de prescripción de ejercicio. Se fija al crear la
    -- reserva a partir de la tarifa y no depende de cuántos se hayan
    -- inscrito hasta ahora.
    cupo_maximo       smallint NOT NULL DEFAULT 1 CHECK (cupo_maximo >= 1),

    canal_origen      agenda.canal_origen NOT NULL DEFAULT 'admin',
    convenio_id       bigint,          -- FK diferida al dominio comercial
    motivo_bloqueo    text,
    notas_internas    text,

    -- Retención del cupo mientras se verifica el pago anticipado.
    reserva_expira_en timestamptz,

    cancelada_en      timestamptz,
    motivo_cancelacion text,
    cancelada_por     text,

    creado_por        text,
    creado_en         timestamptz NOT NULL DEFAULT now(),
    actualizado_en    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT reserva_franjas_validas CHECK (
        NOT isempty(franja_clinica) AND NOT isempty(franja_bloqueo)
        AND franja_clinica <@ franja_bloqueo
    ),
    CONSTRAINT reserva_cita_requiere_servicio CHECK (
        tipo <> 'cita' OR servicio_id IS NOT NULL
    ),
    CONSTRAINT reserva_bloqueo_sin_servicio CHECK (
        tipo <> 'bloqueo' OR servicio_id IS NULL
    ),
    CONSTRAINT reserva_bloqueo_con_motivo CHECK (
        tipo <> 'bloqueo' OR motivo_bloqueo IS NOT NULL
    ),

    -- ------------------------------------------------------------------
    -- LA GARANTÍA CENTRAL DEL SISTEMA
    -- Dos reservas del mismo profesional no pueden solaparse. Se evalúa
    -- dentro de la transacción, así que dos solicitudes simultáneas
    -- desde Telegram y desde la web no pueden ganar las dos.
    -- Las canceladas a tiempo, expiradas, rechazadas y las propuestas de
    -- la IA no ocupan. Las canceladas tarde y las inasistencias SÍ
    -- siguen ocupando la franja: la política dice que esa cita se da
    -- por realizada.
    -- ------------------------------------------------------------------
    CONSTRAINT reserva_sin_solape EXCLUDE USING gist (
        profesional_id WITH =,
        franja_bloqueo WITH &&
    ) WHERE (estado IN ('pendiente_pago','confirmada','en_curso','atendida','no_asistio','cancelada_tarde'))
);

CREATE INDEX reserva_franja_idx      ON agenda.reserva USING gist (franja_clinica);
CREATE INDEX reserva_sede_fecha_idx  ON agenda.reserva (sede_id, lower(franja_clinica));
CREATE INDEX reserva_estado_idx      ON agenda.reserva (estado, lower(franja_clinica));
CREATE INDEX reserva_expiracion_idx  ON agenda.reserva (reserva_expira_en)
    WHERE estado = 'pendiente_pago';

-- ---------------------------------------------------------------------
-- Participantes.
-- Todos los pacientes de una cita viven aquí, incluso cuando la cita es
-- individual. La razón es que en una sesión grupal cada participante
-- consume su propio paquete, así que el consumo pertenece a la relación
-- paciente-reserva y no a la reserva.
-- ---------------------------------------------------------------------

CREATE TYPE agenda.asistencia AS ENUM ('pendiente','asistio','no_asistio','cancelo');

CREATE TABLE agenda.reserva_participante (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reserva_id    bigint NOT NULL REFERENCES agenda.reserva(id) ON DELETE CASCADE,
    paciente_id   bigint NOT NULL REFERENCES personas.paciente(id),
    compra_id     bigint,          -- FK diferida: paquete del que se descuenta
    asistencia    agenda.asistencia NOT NULL DEFAULT 'pendiente',
    -- Registro puntual cuando el paciente paga la sesión suelta.
    valor_cobrado numeric(12,2),
    notas         text,
    creado_en     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (reserva_id, paciente_id)
);

CREATE INDEX reserva_participante_paciente_idx ON agenda.reserva_participante (paciente_id);
CREATE INDEX reserva_participante_compra_idx   ON agenda.reserva_participante (compra_id)
    WHERE compra_id IS NOT NULL;

-- Vista plana de citas individuales, que es el 90% del uso real.
-- n8n y la web consultan esto, no las tablas base.
CREATE VIEW agenda.v_cita AS
SELECT
    r.id                AS reserva_id,
    r.uuid              AS reserva_uuid,
    r.estado,
    r.canal_origen,
    lower(r.franja_clinica) AS inicia_en,
    upper(r.franja_clinica) AS termina_en,
    lower(r.franja_bloqueo) AS bloqueo_inicia_en,
    upper(r.franja_bloqueo) AS bloqueo_termina_en,
    (upper(r.franja_clinica) - lower(r.franja_clinica)) AS duracion,
    se.codigo           AS sede_codigo,
    se.nombre           AS sede_nombre,
    se.google_calendar_id,
    sv.codigo           AS servicio_codigo,
    sv.nombre           AS servicio_nombre,
    rp.paciente_id,
    pa.nombres || ' ' || pa.apellidos AS paciente_nombre,
    pa.telefono         AS paciente_telefono,
    pa.email            AS paciente_email,
    rp.compra_id,
    rp.asistencia,
    r.creado_en
FROM agenda.reserva r
JOIN catalogo.sede se     ON se.id = r.sede_id
LEFT JOIN catalogo.servicio sv ON sv.id = r.servicio_id
LEFT JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
LEFT JOIN personas.paciente pa ON pa.id = rp.paciente_id
WHERE r.tipo = 'cita';

-- =====================================================================
--  DOMINIO 4 · COMERCIAL
--  El precio nunca se lee del catálogo al facturar. Una compra hecha
--  hoy conserva para siempre lo que se pactó, aunque la tarifa cambie
--  mañana.
-- =====================================================================

CREATE TYPE comercial.estado_compra AS ENUM (
    'pendiente_pago','activa','agotada','vencida','anulada'
);

CREATE TABLE comercial.compra (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uuid               uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    paciente_id        bigint NOT NULL REFERENCES personas.paciente(id),

    -- Referencia trazable a la tarifa original...
    tarifa_id          integer REFERENCES catalogo.tarifa(id),
    servicio_id        smallint NOT NULL REFERENCES catalogo.servicio(id),

    -- ...y copia congelada de lo pactado. Estos campos NO se recalculan
    -- nunca, aunque la tarifa de origen se modifique o se desactive.
    servicio_nombre    text NOT NULL,
    tarifa_nombre      text NOT NULL,
    sesiones_incluidas smallint NOT NULL CHECK (sesiones_incluidas >= 1),
    cupo_personas      smallint NOT NULL DEFAULT 1,
    valor_total        numeric(12,2) NOT NULL CHECK (valor_total >= 0),
    moneda             char(3) NOT NULL DEFAULT 'COP',

    estado             comercial.estado_compra NOT NULL DEFAULT 'pendiente_pago',
    canal_origen       agenda.canal_origen NOT NULL DEFAULT 'admin',
    comprada_en        timestamptz NOT NULL DEFAULT now(),
    -- Nulo significa que el paquete no caduca. Confirmar con la clienta.
    vence_en           date,
    anulada_en         timestamptz,
    motivo_anulacion   text,
    creado_en          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX compra_paciente_idx ON comercial.compra (paciente_id, estado);

COMMENT ON TABLE comercial.compra IS
  'Una compra es un contrato congelado. Sesiones sueltas también se registran aquí con sesiones_incluidas = 1, para que el consumo tenga un único mecanismo.';

-- FK diferida que no se pudo declarar antes por orden de creación.
ALTER TABLE agenda.reserva_participante
    ADD CONSTRAINT reserva_participante_compra_fk
    FOREIGN KEY (compra_id) REFERENCES comercial.compra(id);

CREATE TYPE comercial.estado_pago AS ENUM ('registrado','verificado','rechazado','reembolsado');

CREATE TABLE comercial.pago (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    compra_id     bigint REFERENCES comercial.compra(id),
    convenio_id   bigint,          -- FK diferida
    medio_pago_id smallint NOT NULL REFERENCES catalogo.medio_pago(id),
    valor         numeric(12,2) NOT NULL CHECK (valor > 0),
    estado        comercial.estado_pago NOT NULL DEFAULT 'registrado',
    referencia    text,
    pagado_en     timestamptz NOT NULL DEFAULT now(),
    verificado_en timestamptz,
    verificado_por text,
    -- Captura del comprobante de Nequi archivada en Drive.
    google_drive_file_id text,
    notas         text,
    CONSTRAINT pago_tiene_destino CHECK (num_nonnulls(compra_id, convenio_id) = 1)
);

CREATE INDEX pago_compra_idx ON comercial.pago (compra_id);

CREATE TYPE comercial.estado_convenio AS ENUM ('propuesto','abonado','en_ejecucion','cerrado','cancelado');

CREATE TABLE comercial.convenio (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_entidad  text NOT NULL,
    tipo_entidad    text,
    contacto_nombre text,
    contacto_telefono text,
    contacto_email  text,
    -- El abono mínimo vive en catalogo.parametro, no aquí, para que
    -- Lina pueda ajustarlo sin migración.
    valor_propuesto numeric(12,2) CHECK (valor_propuesto >= 0),
    estado          comercial.estado_convenio NOT NULL DEFAULT 'propuesto',
    -- Propuesta comercial generada como Google Doc.
    google_drive_file_id text,
    notas           text,
    creado_en       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE comercial.pago
    ADD CONSTRAINT pago_convenio_fk FOREIGN KEY (convenio_id) REFERENCES comercial.convenio(id);
ALTER TABLE agenda.reserva
    ADD CONSTRAINT reserva_convenio_fk FOREIGN KEY (convenio_id) REFERENCES comercial.convenio(id);

-- ---------------------------------------------------------------------
-- Beneficios.
-- La valoración gratis NO se modela como una tarifa de $0, porque eso
-- ensuciaría los reportes de ingresos con servicios que nunca costaron
-- nada. Se modela como un derecho que se otorga y se redime.
-- ---------------------------------------------------------------------

CREATE TYPE comercial.tipo_beneficio AS ENUM ('valoracion_gratis','descuento_referidos');
CREATE TYPE comercial.estado_beneficio AS ENUM ('disponible','redimido','vencido','anulado');

CREATE TABLE comercial.beneficio (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    paciente_id        bigint NOT NULL REFERENCES personas.paciente(id),
    tipo               comercial.tipo_beneficio NOT NULL,
    estado             comercial.estado_beneficio NOT NULL DEFAULT 'disponible',
    porcentaje_descuento numeric(5,2) CHECK (porcentaje_descuento BETWEEN 0 AND 100),
    origen_compra_id   bigint REFERENCES comercial.compra(id),
    otorgado_en        timestamptz NOT NULL DEFAULT now(),
    vence_en           date,
    redimido_en        timestamptz,
    redimido_compra_id bigint REFERENCES comercial.compra(id),
    redimido_reserva_id bigint REFERENCES agenda.reserva(id),
    notas              text
);

CREATE INDEX beneficio_disponible_idx ON comercial.beneficio (paciente_id)
    WHERE estado = 'disponible';

-- Qué referidos concretos se consumieron al otorgar un descuento. Sin
-- esta tabla, los mismos cinco pacientes servirían para pedir el
-- descuento indefinidamente.
CREATE TABLE comercial.beneficio_referido (
    beneficio_id         bigint NOT NULL REFERENCES comercial.beneficio(id) ON DELETE CASCADE,
    paciente_referido_id bigint NOT NULL REFERENCES personas.paciente(id),
    PRIMARY KEY (beneficio_id, paciente_referido_id),
    -- Un referido sólo puede contarse una vez en toda la vida del programa.
    UNIQUE (paciente_referido_id)
);

-- ---------------------------------------------------------------------
-- Saldos derivados. Nunca almacenados.
-- ---------------------------------------------------------------------

CREATE VIEW comercial.v_saldo_paquete AS
SELECT
    c.id                AS compra_id,
    c.uuid              AS compra_uuid,
    c.paciente_id,
    c.servicio_id,
    c.servicio_nombre,
    c.tarifa_nombre,
    c.estado,
    c.sesiones_incluidas,
    -- Consumidas: atendidas, inasistencias y cancelaciones tardías.
    -- Las tres descuentan porque la política dice que la cita se dio
    -- por realizada.
    count(*) FILTER (WHERE r.estado IN ('atendida','no_asistio','cancelada_tarde'))::integer
                        AS sesiones_consumidas,
    -- Comprometidas: agendadas a futuro pero todavía no ocurridas.
    count(*) FILTER (WHERE r.estado IN ('pendiente_pago','confirmada','en_curso'))::integer
                        AS sesiones_comprometidas,
    (c.sesiones_incluidas
       - count(*) FILTER (WHERE r.estado IN ('atendida','no_asistio','cancelada_tarde'))
       - count(*) FILTER (WHERE r.estado IN ('pendiente_pago','confirmada','en_curso'))
    )::integer          AS sesiones_disponibles,
    c.valor_total,
    coalesce(sum(pg.valor) FILTER (WHERE pg.estado = 'verificado'), 0) AS valor_pagado,
    (c.valor_total - coalesce(sum(pg.valor) FILTER (WHERE pg.estado = 'verificado'), 0)) AS saldo_pendiente,
    c.vence_en,
    c.comprada_en
FROM comercial.compra c
LEFT JOIN agenda.reserva_participante rp ON rp.compra_id = c.id
LEFT JOIN agenda.reserva r  ON r.id = rp.reserva_id
LEFT JOIN comercial.pago pg ON pg.compra_id = c.id
WHERE c.estado <> 'anulada'
GROUP BY c.id;

COMMENT ON VIEW comercial.v_saldo_paquete IS
  'Único lugar donde se responde "cuántas sesiones me quedan". El bot jamás debe calcular esto por su cuenta.';

-- Referidos que ya cumplieron y todavía no han sido canjeados.
CREATE VIEW comercial.v_referidos_elegibles AS
SELECT
    ref.id                          AS paciente_referente_id,
    ref.nombres || ' ' || ref.apellidos AS referente_nombre,
    count(DISTINCT p.id)::integer   AS referidos_efectivos,
    (count(DISTINCT p.id) >= (SELECT valor::integer FROM catalogo.parametro WHERE clave = 'referidos_para_descuento'))
                                    AS aplica_descuento,
    array_agg(DISTINCT p.id)        AS ids_referidos
FROM personas.paciente ref
JOIN personas.paciente p ON p.referido_por_paciente_id = ref.id
WHERE EXISTS (
        -- "Que agenden Y asistan": no basta con registrarse.
        SELECT 1
        FROM agenda.reserva_participante rp
        JOIN agenda.reserva r ON r.id = rp.reserva_id
        WHERE rp.paciente_id = p.id AND r.estado = 'atendida'
      )
  AND NOT EXISTS (
        SELECT 1 FROM comercial.beneficio_referido br
        WHERE br.paciente_referido_id = p.id
      )
GROUP BY ref.id, ref.nombres, ref.apellidos;

-- =====================================================================
--  DOMINIO 5 · CLINICO
--  Append-only. Una evolución no se edita: se corrige con un registro
--  nuevo que anula al anterior y deja el rastro. Esto tiene valor legal.
-- =====================================================================

CREATE TABLE clinico.anamnesis (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    paciente_id        bigint NOT NULL REFERENCES personas.paciente(id),
    reserva_id         bigint REFERENCES agenda.reserva(id),

    motivo_consulta_id smallint REFERENCES catalogo.motivo_consulta(id),
    motivo_detalle     text,
    descripcion_paciente text,

    enfermedad_actual  text,
    inicio_sintomas    date,
    causa_aparente     text,
    tratamientos_previos text,
    respuesta_tratamientos text,

    objetivos_terapeuticos text,

    registrado_por     text NOT NULL,
    registrado_en      timestamptz NOT NULL DEFAULT now(),
    -- Corrección: apunta al registro que deja sin efecto.
    anula_a_id         bigint REFERENCES clinico.anamnesis(id),
    motivo_correccion  text,

    CONSTRAINT anamnesis_correccion_justificada CHECK (
        anula_a_id IS NULL OR motivo_correccion IS NOT NULL
    )
);

CREATE INDEX anamnesis_paciente_idx ON clinico.anamnesis (paciente_id, registrado_en DESC);

CREATE TABLE clinico.paciente_antecedente (
    paciente_id    bigint   NOT NULL REFERENCES personas.paciente(id) ON DELETE CASCADE,
    antecedente_id smallint NOT NULL REFERENCES catalogo.antecedente(id),
    detalle        text,
    registrado_en  timestamptz NOT NULL DEFAULT now(),
    registrado_por text,
    PRIMARY KEY (paciente_id, antecedente_id)
);

CREATE TABLE clinico.signos_vitales (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    paciente_id   bigint NOT NULL REFERENCES personas.paciente(id),
    reserva_id    bigint REFERENCES agenda.reserva(id),

    sistolica     smallint CHECK (sistolica BETWEEN 40 AND 300),
    diastolica    smallint CHECK (diastolica BETWEEN 20 AND 200),
    frecuencia_cardiaca    smallint CHECK (frecuencia_cardiaca BETWEEN 20 AND 250),
    frecuencia_respiratoria smallint CHECK (frecuencia_respiratoria BETWEEN 4 AND 80),
    saturacion_o2 smallint CHECK (saturacion_o2 BETWEEN 50 AND 100),

    peso_kg       numeric(5,2) CHECK (peso_kg  BETWEEN 2 AND 400),
    talla_cm      numeric(5,1) CHECK (talla_cm BETWEEN 30 AND 260),

    -- El IMC sí se materializa porque es una función pura de dos
    -- columnas de la misma fila y el motor garantiza la coherencia.
    imc numeric(5,2) GENERATED ALWAYS AS (
        CASE WHEN peso_kg IS NOT NULL AND talla_cm IS NOT NULL AND talla_cm > 0
             THEN round(peso_kg / ((talla_cm / 100.0) ^ 2), 2)
        END
    ) STORED,

    tomado_en     timestamptz NOT NULL DEFAULT now(),
    tomado_por    text,
    CONSTRAINT ta_completa CHECK (num_nonnulls(sistolica, diastolica) <> 1)
);

CREATE INDEX signos_vitales_paciente_idx ON clinico.signos_vitales (paciente_id, tomado_en DESC);

-- Las clasificaciones NO se almacenan. Si se guardara el texto
-- "taquicardia", tarde o temprano quedaría una fila con FC de 55
-- etiquetada como taquicardia. Además, los rangos de referencia se
-- actualizan: una vista se corrige, un dato histórico mal etiquetado no.
CREATE VIEW clinico.v_signos_vitales AS
SELECT
    sv.*,
    CASE
        WHEN sv.sistolica IS NULL THEN NULL
        WHEN sv.sistolica <  90  OR sv.diastolica <  60 THEN 'Hipotensión'
        WHEN sv.sistolica >= 140 OR sv.diastolica >= 90 THEN 'HTA Etapa 2'
        WHEN sv.sistolica >= 130 OR sv.diastolica >= 80 THEN 'HTA Etapa 1'
        WHEN sv.sistolica >= 120                        THEN 'Elevada'
        ELSE 'Normotensión'
    END AS estado_tension,
    CASE
        WHEN sv.frecuencia_cardiaca IS NULL      THEN NULL
        WHEN sv.frecuencia_cardiaca <  60        THEN 'Bradicardia'
        WHEN sv.frecuencia_cardiaca >  100       THEN 'Taquicardia'
        ELSE 'Normocardia'
    END AS estado_frecuencia_cardiaca,
    CASE
        WHEN sv.frecuencia_respiratoria IS NULL  THEN NULL
        WHEN sv.frecuencia_respiratoria <  12    THEN 'Bradipnea'
        WHEN sv.frecuencia_respiratoria >  20    THEN 'Taquipnea'
        ELSE 'Eupnea'
    END AS estado_frecuencia_respiratoria,
    CASE
        WHEN sv.saturacion_o2 IS NULL            THEN NULL
        WHEN sv.saturacion_o2 <  90              THEN 'Hipoxia severa'
        WHEN sv.saturacion_o2 <  95              THEN 'Hipoxia leve'
        ELSE 'Normal'
    END AS estado_saturacion,
    CASE
        WHEN sv.imc IS NULL      THEN NULL
        WHEN sv.imc <  18.5      THEN 'Bajo peso'
        WHEN sv.imc <  25.0      THEN 'Normal'
        WHEN sv.imc <  30.0      THEN 'Sobrepeso'
        ELSE 'Obesidad'
    END AS estado_imc,
    -- Semáforo agregado para la interfaz administrativa.
    (sv.sistolica >= 140 OR sv.diastolica >= 90 OR sv.saturacion_o2 < 90
     OR sv.frecuencia_cardiaca > 100 OR sv.frecuencia_cardiaca < 60) AS requiere_atencion
FROM clinico.signos_vitales sv;

CREATE TYPE clinico.comportamiento_dolor AS ENUM (
    'continuo','intermitente','aumenta_con_movimiento','aumenta_en_reposo','nocturno'
);

CREATE TABLE clinico.evaluacion_dolor (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    paciente_id   bigint NOT NULL REFERENCES personas.paciente(id),
    reserva_id    bigint REFERENCES agenda.reserva(id),
    -- Escala EVA
    intensidad    smallint NOT NULL CHECK (intensidad BETWEEN 0 AND 10),
    comportamiento clinico.comportamiento_dolor,
    localizacion  text,
    zona_id       smallint REFERENCES catalogo.zona_anatomica(id),
    evaluado_en   timestamptz NOT NULL DEFAULT now(),
    evaluado_por  text
);

CREATE INDEX evaluacion_dolor_paciente_idx ON clinico.evaluacion_dolor (paciente_id, evaluado_en DESC);

-- Selección múltiple del tipo de dolor.
CREATE TABLE clinico.evaluacion_dolor_tipo (
    evaluacion_id bigint   NOT NULL REFERENCES clinico.evaluacion_dolor(id) ON DELETE CASCADE,
    tipo_dolor_id smallint NOT NULL REFERENCES catalogo.tipo_dolor(id),
    PRIMARY KEY (evaluacion_id, tipo_dolor_id)
);

CREATE VIEW clinico.v_evaluacion_dolor AS
SELECT
    ed.*,
    CASE
        WHEN ed.intensidad = 0            THEN 'Sin dolor'
        WHEN ed.intensidad BETWEEN 1 AND 3 THEN 'Leve'
        WHEN ed.intensidad BETWEEN 4 AND 6 THEN 'Moderado'
        WHEN ed.intensidad BETWEEN 7 AND 9 THEN 'Severo'
        ELSE 'Inaguantable'
    END AS clasificacion,
    (SELECT array_agg(td.nombre ORDER BY td.nombre)
       FROM clinico.evaluacion_dolor_tipo edt
       JOIN catalogo.tipo_dolor td ON td.id = edt.tipo_dolor_id
      WHERE edt.evaluacion_id = ed.id) AS tipos_dolor
FROM clinico.evaluacion_dolor ed;

CREATE TABLE clinico.evolucion (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    paciente_id   bigint NOT NULL REFERENCES personas.paciente(id),
    reserva_id    bigint NOT NULL REFERENCES agenda.reserva(id),
    subjetivo     text,
    objetivo      text,
    analisis      text,
    plan          text,
    tecnicas_aplicadas text,
    registrado_por text NOT NULL,
    registrado_en timestamptz NOT NULL DEFAULT now(),
    anula_a_id    bigint REFERENCES clinico.evolucion(id),
    motivo_correccion text,
    CONSTRAINT evolucion_correccion_justificada CHECK (
        anula_a_id IS NULL OR motivo_correccion IS NOT NULL
    )
);

CREATE INDEX evolucion_paciente_idx ON clinico.evolucion (paciente_id, registrado_en DESC);

-- Bloqueo de UPDATE y DELETE sobre los registros clínicos.
CREATE FUNCTION clinico.impedir_modificacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
      'Los registros clínicos son inmutables. Para corregir, inserte un registro nuevo con anula_a_id = %.',
      OLD.id
      USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER anamnesis_inmutable
    BEFORE UPDATE OR DELETE ON clinico.anamnesis
    FOR EACH ROW EXECUTE FUNCTION clinico.impedir_modificacion();

CREATE TRIGGER evolucion_inmutable
    BEFORE UPDATE OR DELETE ON clinico.evolucion
    FOR EACH ROW EXECUTE FUNCTION clinico.impedir_modificacion();

CREATE TRIGGER signos_vitales_inmutable
    BEFORE UPDATE OR DELETE ON clinico.signos_vitales
    FOR EACH ROW EXECUTE FUNCTION clinico.impedir_modificacion();

-- =====================================================================
--  DOMINIO 6 · INTEGRACION
--  Aquí vive el desacople con Google Workspace. La regla es una sola:
--  PostgreSQL escribe hacia Google, nunca lee de Google para decidir.
--  Si Calendar está caído, la cita ya existe y es válida; el espejo se
--  pone al día después.
-- =====================================================================

CREATE TYPE integracion.servicio_google AS ENUM (
    'calendar','drive','sheets','docs','gmail','contacts','forms'
);

CREATE TYPE integracion.estado_outbox AS ENUM (
    'pendiente','en_proceso','completado','fallido','descartado'
);

-- ---------------------------------------------------------------------
-- Outbox transaccional.
-- Cuando se confirma una reserva se escribe aquí un evento EN LA MISMA
-- TRANSACCIÓN. n8n lo consume después. Esto garantiza que no exista una
-- cita confirmada sin su intento de sincronización, ni una llamada a
-- Google por una cita que al final falló.
-- ---------------------------------------------------------------------

CREATE TABLE integracion.outbox (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agregado_tipo    text NOT NULL,   -- 'reserva','paciente','pago','compra'
    agregado_id      bigint NOT NULL,
    tipo_evento      text NOT NULL,   -- 'reserva.confirmada','reserva.cancelada', ...
    destino          integracion.servicio_google,
    payload          jsonb NOT NULL,

    estado           integracion.estado_outbox NOT NULL DEFAULT 'pendiente',
    intentos         smallint NOT NULL DEFAULT 0,
    max_intentos     smallint NOT NULL DEFAULT 5,
    disponible_desde timestamptz NOT NULL DEFAULT now(),
    ultimo_error     text,
    procesado_en     timestamptz,
    creado_en        timestamptz NOT NULL DEFAULT now(),

    -- Idempotencia: si n8n reintenta el mismo evento, no se duplica.
    clave_idempotencia text UNIQUE
);

CREATE INDEX outbox_pendientes_idx ON integracion.outbox (disponible_desde, id)
    WHERE estado IN ('pendiente','fallido');
CREATE INDEX outbox_agregado_idx ON integracion.outbox (agregado_tipo, agregado_id);

-- ---------------------------------------------------------------------
-- Mapa de recursos de Google.
-- Una sola tabla para toda la correspondencia entre entidades locales y
-- objetos de Workspace: eventos de Calendar, archivos de Drive,
-- contactos, hilos de Gmail. Evita esparcir columnas google_*_id por
-- todo el modelo.
-- ---------------------------------------------------------------------

CREATE TABLE integracion.google_recurso (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entidad_tipo    text NOT NULL,
    entidad_id      bigint NOT NULL,
    servicio        integracion.servicio_google NOT NULL,
    -- Calendar: calendarId. Drive: folderId contenedor.
    contenedor_id   text,
    recurso_id      text NOT NULL,
    recurso_url     text,
    etag            text,
    -- Huella del estado local en el momento de sincronizar. Permite
    -- detectar deriva sin volver a leer de Google.
    hash_local      text,
    sincronizado_en timestamptz NOT NULL DEFAULT now(),
    creado_en       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (servicio, recurso_id),
    UNIQUE (entidad_tipo, entidad_id, servicio)
);

CREATE INDEX google_recurso_entidad_idx ON integracion.google_recurso (entidad_tipo, entidad_id);

-- ---------------------------------------------------------------------
-- Trazabilidad del modelo de IA.
-- El modelo no tiene credenciales y no escribe en ninguna tabla de
-- negocio. Produce JSON estructurado que queda registrado aquí, y sólo
-- una función del núcleo puede convertirlo en una reserva real.
-- ---------------------------------------------------------------------

CREATE TYPE integracion.estado_propuesta AS ENUM (
    'generada','aceptada','rechazada','expirada','error_validacion'
);

CREATE TABLE integracion.propuesta_ia (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canal          agenda.canal_origen NOT NULL,
    chat_id        bigint,
    paciente_id    bigint REFERENCES personas.paciente(id),
    intencion      text,
    modelo         text NOT NULL,
    mensaje_usuario text,
    json_propuesto jsonb NOT NULL,
    confianza      numeric(4,3) CHECK (confianza BETWEEN 0 AND 1),
    estado         integracion.estado_propuesta NOT NULL DEFAULT 'generada',
    error_validacion text,
    reserva_id     bigint REFERENCES agenda.reserva(id),
    requiere_revision_humana boolean NOT NULL DEFAULT false,
    revisado_por   text,
    revisado_en    timestamptz,
    creado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX propuesta_ia_chat_idx ON integracion.propuesta_ia (chat_id, creado_en DESC);

COMMENT ON TABLE integracion.propuesta_ia IS
  'Registro forense de todo lo que el modelo propuso, incluso lo que fue rechazado. Sin esto no hay forma de auditar por qué el bot ofreció un horario imposible.';

CREATE TABLE integracion.mensaje_canal (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canal        agenda.canal_origen NOT NULL,
    direccion    text NOT NULL CHECK (direccion IN ('entrante','saliente')),
    chat_id      bigint,
    paciente_id  bigint REFERENCES personas.paciente(id),
    contenido    text,
    metadata     jsonb,
    recibido_en  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mensaje_canal_chat_idx ON integracion.mensaje_canal (chat_id, recibido_en DESC);

CREATE TYPE integracion.estado_notificacion AS ENUM (
    'pendiente','enviada','fallida','cancelada'
);

CREATE TABLE integracion.notificacion (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    paciente_id     bigint REFERENCES personas.paciente(id),
    reserva_id      bigint REFERENCES agenda.reserva(id),
    plantilla       text NOT NULL,   -- 'confirmacion','recordatorio_24h','indicaciones_previas'
    canal           agenda.canal_origen NOT NULL,
    destinatario    text NOT NULL,
    asunto          text,
    cuerpo          text,
    programada_para timestamptz NOT NULL DEFAULT now(),
    estado          integracion.estado_notificacion NOT NULL DEFAULT 'pendiente',
    enviada_en      timestamptz,
    gmail_message_id text,
    error           text,
    creado_en       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notificacion_pendiente_idx ON integracion.notificacion (programada_para)
    WHERE estado = 'pendiente';

-- Idempotencia: un mismo recordatorio no se reclama dos veces aunque el
-- barrido del bot se solape o se repita. Incluye paciente_id porque una
-- reserva grupal (cupo_maximo > 1) tiene un participante por fila y cada
-- uno necesita su propio recordatorio.
CREATE UNIQUE INDEX notificacion_reserva_paciente_plantilla_uniq ON integracion.notificacion (reserva_id, paciente_id, plantilla)
    WHERE reserva_id IS NOT NULL AND paciente_id IS NOT NULL;

-- Registro de ejecuciones de n8n, para depurar sin adivinar.
CREATE TABLE integracion.ejecucion_n8n (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workflow           text NOT NULL,
    ejecucion_externa_id text,
    clave_idempotencia text UNIQUE,
    outbox_id          bigint REFERENCES integracion.outbox(id),
    estado             text NOT NULL,
    detalle            jsonb,
    iniciado_en        timestamptz NOT NULL DEFAULT now(),
    finalizado_en      timestamptz
);

-- =====================================================================
--  VISTAS PARA GOOGLE WORKSPACE
--  Estas vistas son el contrato con n8n. Cada una entrega el payload
--  listo para un nodo de Google, sin que el workflow tenga que
--  componer nada.
-- =====================================================================

-- Payload de evento de Google Calendar.
-- NOTA DE PRIVACIDAD: el calendario es visible en el Workspace y en el
-- teléfono de Lina. No lleva diagnóstico, ni antecedentes, ni EVA. Sólo
-- lo mínimo para reconocer la cita.
CREATE VIEW integracion.v_calendar_evento AS
SELECT
    r.id                AS reserva_id,
    r.uuid              AS reserva_uuid,
    r.estado,
    coalesce(se.google_calendar_id, pr.google_calendar_id) AS calendar_id,
    gr.recurso_id       AS google_event_id,
    CASE r.tipo
        WHEN 'bloqueo' THEN coalesce(r.motivo_bloqueo, 'No disponible')
        ELSE coalesce(sv.nombre, 'Cita') || ' · ' ||
             coalesce(string_agg(DISTINCT pa.nombres || ' ' || pa.apellidos, ', '), 'Sin paciente')
    END                 AS titulo,
    concat_ws(E'\n',
        'Sede: '     || se.nombre,
        'Servicio: ' || sv.nombre,
        'Estado: '   || r.estado::text,
        'Canal: '    || r.canal_origen::text,
        'Ref: '      || r.uuid::text
    )                   AS descripcion,
    se.direccion        AS ubicacion,
    lower(r.franja_bloqueo) AS inicia_en,
    upper(r.franja_bloqueo) AS termina_en,
    se.zona_horaria,
    r.actualizado_en
FROM agenda.reserva r
JOIN catalogo.sede se        ON se.id = r.sede_id
JOIN personas.profesional pr ON pr.id = r.profesional_id
LEFT JOIN catalogo.servicio sv ON sv.id = r.servicio_id
LEFT JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
LEFT JOIN personas.paciente pa ON pa.id = rp.paciente_id
LEFT JOIN integracion.google_recurso gr
       ON gr.entidad_tipo = 'reserva' AND gr.entidad_id = r.id AND gr.servicio = 'calendar'
GROUP BY r.id, se.id, pr.id, sv.id, gr.recurso_id;

-- Hoja "Agenda" del Google Sheets de operación.
CREATE VIEW integracion.v_sheet_agenda AS
SELECT
    to_char(lower(r.franja_clinica) AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS fecha,
    to_char(lower(r.franja_clinica) AT TIME ZONE 'America/Bogota', 'HH24:MI')    AS hora_inicio,
    to_char(upper(r.franja_clinica) AT TIME ZONE 'America/Bogota', 'HH24:MI')    AS hora_fin,
    se.nombre       AS sede,
    sv.nombre       AS servicio,
    string_agg(pa.nombres || ' ' || pa.apellidos, ', ' ORDER BY pa.apellidos) AS pacientes,
    r.estado::text  AS estado,
    r.canal_origen::text AS canal,
    r.uuid::text    AS referencia
FROM agenda.reserva r
JOIN catalogo.sede se ON se.id = r.sede_id
LEFT JOIN catalogo.servicio sv ON sv.id = r.servicio_id
LEFT JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
LEFT JOIN personas.paciente pa ON pa.id = rp.paciente_id
GROUP BY r.id, se.nombre, sv.nombre
ORDER BY lower(r.franja_clinica);

-- Hoja "Ingresos". Sin datos clínicos ni de contacto.
CREATE VIEW integracion.v_sheet_ingresos AS
SELECT
    to_char(pg.pagado_en AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS fecha,
    to_char(pg.pagado_en AT TIME ZONE 'America/Bogota', 'YYYY-MM')    AS periodo,
    coalesce(c.servicio_nombre, cv.nombre_entidad) AS concepto,
    coalesce(c.tarifa_nombre, 'Convenio')          AS detalle,
    mp.nombre        AS medio_pago,
    pg.valor,
    pg.estado::text  AS estado_pago,
    pg.referencia
FROM comercial.pago pg
JOIN catalogo.medio_pago mp ON mp.id = pg.medio_pago_id
LEFT JOIN comercial.compra   c  ON c.id  = pg.compra_id
LEFT JOIN comercial.convenio cv ON cv.id = pg.convenio_id
ORDER BY pg.pagado_en DESC;

-- Hoja "Paquetes activos", que es lo que Lina revisa a diario.
CREATE VIEW integracion.v_sheet_paquetes AS
SELECT
    pa.nombres || ' ' || pa.apellidos AS paciente,
    pa.telefono,
    s.servicio_nombre                 AS servicio,
    s.tarifa_nombre                   AS paquete,
    s.sesiones_incluidas,
    s.sesiones_consumidas,
    s.sesiones_disponibles,
    s.valor_total,
    s.valor_pagado,
    s.saldo_pendiente,
    to_char(s.comprada_en AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS comprada_el,
    s.estado::text                    AS estado
FROM comercial.v_saldo_paquete s
JOIN personas.paciente pa ON pa.id = s.paciente_id
WHERE s.sesiones_disponibles > 0
ORDER BY pa.apellidos, s.comprada_en;

-- =====================================================================
--  FUNCIONES DE NEGOCIO
--  Este es el contrato con n8n y con la web. Ningún canal escribe
--  directamente sobre `agenda.reserva`: todos invocan estas funciones.
--  De este modo la regla de negocio vive en un solo lugar y no hay que
--  reimplementarla en cada workflow.
-- =====================================================================

CREATE FUNCTION public.tg_actualizado_en() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.actualizado_en := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER reserva_actualizado_en BEFORE UPDATE ON agenda.reserva
    FOR EACH ROW EXECUTE FUNCTION public.tg_actualizado_en();
CREATE TRIGGER paciente_actualizado_en BEFORE UPDATE ON personas.paciente
    FOR EACH ROW EXECUTE FUNCTION public.tg_actualizado_en();

-- ---------------------------------------------------------------------
-- Disponibilidad.
-- Es la única fuente de horarios que puede ofrecer el bot. El modelo de
-- IA nunca inventa un horario: pide esta lista y elige de ella.
-- ---------------------------------------------------------------------

CREATE FUNCTION agenda.slots_disponibles(
    p_servicio_id          smallint,
    p_sede_id              smallint,
    p_fecha                date,
    p_profesional_id       smallint DEFAULT NULL,
    p_granularidad_minutos integer  DEFAULT 30
)
RETURNS TABLE (slot_inicio timestamptz, slot_fin timestamptz, slot_bloqueo tstzrange)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_duracion  interval;
    v_prev      interval;
    v_post      interval;
    v_tz        text;
    v_prof      smallint;
BEGIN
    SELECT make_interval(mins => s.duracion_min_minutos),
           make_interval(mins => s.buffer_previo_minutos),
           make_interval(mins => s.buffer_posterior_minutos)
      INTO v_duracion, v_prev, v_post
      FROM catalogo.servicio s
     WHERE s.id = p_servicio_id AND s.activo;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El servicio % no existe o está inactivo.', p_servicio_id
              USING ERRCODE = 'no_data_found';
    END IF;

    SELECT sd.zona_horaria INTO v_tz
      FROM catalogo.sede sd WHERE sd.id = p_sede_id AND sd.activo;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La sede % no existe o está inactiva.', p_sede_id
              USING ERRCODE = 'no_data_found';
    END IF;

    v_prof := coalesce(
        p_profesional_id,
        (SELECT pf.id FROM personas.profesional pf WHERE pf.activo ORDER BY pf.id LIMIT 1)
    );

    RETURN QUERY
    WITH ventanas AS (
        -- Cada franja de atención del día. El almuerzo es simplemente
        -- el hueco entre dos ventanas, no una regla especial.
        SELECT ((p_fecha + h.hora_inicio) AT TIME ZONE v_tz) AS desde,
               ((p_fecha + h.hora_fin)    AT TIME ZONE v_tz) AS hasta
          FROM agenda.horario_atencion h
         WHERE h.profesional_id = v_prof
           AND h.sede_id        = p_sede_id
           AND h.dia_semana     = extract(dow FROM p_fecha)::smallint
           AND h.vigente_desde <= p_fecha
           AND (h.vigente_hasta IS NULL OR h.vigente_hasta >= p_fecha)
    ),
    candidatos AS (
        SELECT g                            AS ini,
               g + v_duracion               AS fin,
               tstzrange(g - v_prev, g + v_duracion + v_post, '[)') AS bloqueo
          FROM ventanas v
          CROSS JOIN LATERAL generate_series(
                 v.desde,
                 v.hasta - v_duracion,
                 make_interval(mins => p_granularidad_minutos)
             ) AS g
         WHERE g + v_duracion <= v.hasta
    )
    SELECT c.ini, c.fin, c.bloqueo
      FROM candidatos c
     WHERE c.ini > now()
       AND NOT EXISTS (
             SELECT 1
               FROM agenda.reserva r
              WHERE r.profesional_id = v_prof
                AND r.estado IN ('pendiente_pago','confirmada','en_curso',
                                 'atendida','no_asistio','cancelada_tarde')
                AND r.franja_bloqueo && c.bloqueo
           )
     ORDER BY c.ini;
END;
$$;

COMMENT ON FUNCTION agenda.slots_disponibles IS
  'Devuelve horarios realmente agendables. Ya descuenta el tiempo de preparación entre pacientes y respeta la franja de almuerzo.';

-- ---------------------------------------------------------------------
-- Creación de reserva.
-- Punto de entrada único. La restricción de exclusión hace el trabajo
-- pesado: si dos canales piden el mismo horario en el mismo instante,
-- uno de los dos recibe el error y el motor garantiza que no queden
-- dos citas encima.
-- ---------------------------------------------------------------------

CREATE FUNCTION agenda.crear_reserva(
    p_paciente_id        bigint,
    p_servicio_id        smallint,
    p_sede_id            smallint,
    p_inicia_en          timestamptz,
    p_canal              agenda.canal_origen DEFAULT 'admin',
    p_compra_id          bigint   DEFAULT NULL,
    p_duracion_minutos   integer  DEFAULT NULL,
    p_profesional_id     smallint DEFAULT NULL,
    p_creado_por         text     DEFAULT NULL,
    p_cupo_maximo        smallint DEFAULT 1
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = catalogo, personas, agenda, comercial, integracion, public
AS $$
DECLARE
    v_srv         catalogo.servicio%ROWTYPE;
    v_prof        smallint;
    v_duracion    interval;
    v_clinica     tstzrange;
    v_bloqueo     tstzrange;
    v_reserva_id  bigint;
    v_retencion   integer;
    v_disponibles integer;
BEGIN
    IF p_inicia_en IS NULL OR p_paciente_id IS NULL OR p_servicio_id IS NULL OR p_sede_id IS NULL THEN
        RAISE EXCEPTION 'Faltan datos obligatorios para crear la reserva (paciente, servicio, sede y hora de inicio).'
              USING ERRCODE = 'null_value_not_allowed';
    END IF;

    SELECT * INTO v_srv FROM catalogo.servicio WHERE id = p_servicio_id AND activo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El servicio solicitado no está disponible.'
              USING ERRCODE = 'no_data_found';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM personas.paciente WHERE id = p_paciente_id AND activo) THEN
        RAISE EXCEPTION 'El paciente % no existe o está inactivo.', p_paciente_id
              USING ERRCODE = 'no_data_found';
    END IF;

    v_prof := coalesce(
        p_profesional_id,
        (SELECT id FROM personas.profesional WHERE activo ORDER BY id LIMIT 1)
    );

    -- La duración puede negociarse dentro del rango del servicio.
    -- Terapia neural y PRP van de 60 a 120 minutos según el caso.
    v_duracion := make_interval(mins => coalesce(p_duracion_minutos, v_srv.duracion_min_minutos));

    IF coalesce(p_duracion_minutos, v_srv.duracion_min_minutos)
       NOT BETWEEN v_srv.duracion_min_minutos AND v_srv.duracion_max_minutos THEN
        RAISE EXCEPTION 'La duración solicitada está fuera del rango del servicio (% a % minutos).',
              v_srv.duracion_min_minutos, v_srv.duracion_max_minutos
              USING ERRCODE = 'check_violation';
    END IF;

    v_clinica := tstzrange(p_inicia_en, p_inicia_en + v_duracion, '[)');
    v_bloqueo := tstzrange(
        p_inicia_en - make_interval(mins => v_srv.buffer_previo_minutos),
        p_inicia_en + v_duracion + make_interval(mins => v_srv.buffer_posterior_minutos),
        '[)'
    );

    IF p_inicia_en <= now() THEN
        RAISE EXCEPTION 'No es posible agendar en el pasado.'
              USING ERRCODE = 'check_violation';
    END IF;

    -- La cita debe caber completa dentro de una franja de atención
    -- vigente para esa sede y ese día.
    IF NOT EXISTS (
        SELECT 1
          FROM agenda.horario_atencion h,
               catalogo.sede sd
         WHERE sd.id = p_sede_id
           AND h.profesional_id = v_prof
           AND h.sede_id        = p_sede_id
           AND h.dia_semana     = extract(dow FROM (p_inicia_en AT TIME ZONE sd.zona_horaria))::smallint
           AND h.vigente_desde <= (p_inicia_en AT TIME ZONE sd.zona_horaria)::date
           AND (h.vigente_hasta IS NULL
                OR h.vigente_hasta >= (p_inicia_en AT TIME ZONE sd.zona_horaria)::date)
           AND (p_inicia_en AT TIME ZONE sd.zona_horaria)::time >= h.hora_inicio
           AND ((p_inicia_en + v_duracion) AT TIME ZONE sd.zona_horaria)::time <= h.hora_fin
    ) THEN
        RAISE EXCEPTION 'El horario solicitado está fuera de la atención de esta sede.'
              USING ERRCODE = 'check_violation';
    END IF;

    -- Si se descuenta de un paquete, verificar que quede saldo.
    IF p_compra_id IS NOT NULL THEN
        SELECT sesiones_disponibles INTO v_disponibles
          FROM comercial.v_saldo_paquete WHERE compra_id = p_compra_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'El paquete % no existe.', p_compra_id
                  USING ERRCODE = 'no_data_found';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM comercial.compra
                        WHERE id = p_compra_id AND paciente_id = p_paciente_id) THEN
            RAISE EXCEPTION 'El paquete no pertenece a este paciente.'
                  USING ERRCODE = 'check_violation';
        END IF;

        IF v_disponibles <= 0 THEN
            RAISE EXCEPTION 'El paquete no tiene sesiones disponibles.'
                  USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    SELECT valor::integer INTO v_retencion
      FROM catalogo.parametro WHERE clave = 'minutos_retencion_reserva';

    BEGIN
        INSERT INTO agenda.reserva (
            tipo, estado, profesional_id, sede_id, servicio_id,
            franja_clinica, franja_bloqueo, cupo_maximo,
            canal_origen, reserva_expira_en, creado_por
        ) VALUES (
            'cita',
            -- Con paquete pagado la cita nace confirmada. Sin paquete
            -- queda reteniendo el cupo hasta que se verifique el pago.
            (CASE WHEN p_compra_id IS NOT NULL THEN 'confirmada' ELSE 'pendiente_pago' END)::agenda.estado_reserva,
            v_prof, p_sede_id, p_servicio_id,
            v_clinica, v_bloqueo, p_cupo_maximo,
            p_canal,
            CASE WHEN p_compra_id IS NULL
                 THEN now() + make_interval(mins => coalesce(v_retencion, 30))
            END,
            coalesce(p_creado_por, session_user)
        )
        RETURNING id INTO v_reserva_id;
    EXCEPTION WHEN exclusion_violation THEN
        -- Este es el caso de carrera real: dos canales pidiendo lo
        -- mismo a la vez. El mensaje debe ser legible por el bot.
        RAISE EXCEPTION 'El horario % ya fue tomado. Consulte nuevamente la disponibilidad.',
              to_char(p_inicia_en AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY HH24:MI')
              USING ERRCODE = 'unique_violation';
    END;

    INSERT INTO agenda.reserva_participante (reserva_id, paciente_id, compra_id)
    VALUES (v_reserva_id, p_paciente_id, p_compra_id);

    RETURN v_reserva_id;
END;
$$;

-- Inscripción de un paciente adicional en una sesión grupal.
CREATE FUNCTION agenda.inscribir_participante(
    p_reserva_id  bigint,
    p_paciente_id bigint,
    p_compra_id   bigint DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = catalogo, personas, agenda, comercial, public
AS $$
DECLARE
    v_cupo     smallint;
    v_inscritos integer;
    v_id       bigint;
BEGIN
    SELECT cupo_maximo INTO v_cupo
      FROM agenda.reserva WHERE id = p_reserva_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La reserva % no existe.', p_reserva_id USING ERRCODE = 'no_data_found';
    END IF;

    SELECT count(*) INTO v_inscritos
      FROM agenda.reserva_participante WHERE reserva_id = p_reserva_id;

    IF v_inscritos >= v_cupo THEN
        RAISE EXCEPTION 'La sesión ya alcanzó su cupo de % personas.', v_cupo
              USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO agenda.reserva_participante (reserva_id, paciente_id, compra_id)
    VALUES (p_reserva_id, p_paciente_id, p_compra_id)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------
-- Cancelación.
-- La ventana de 24 a 48 horas no la decide el bot ni el paciente: la
-- decide esta función leyendo el parámetro configurable.
-- ---------------------------------------------------------------------

CREATE FUNCTION agenda.cancelar_reserva(
    p_reserva_id bigint,
    p_motivo     text,
    p_por        text DEFAULT NULL
) RETURNS agenda.estado_reserva
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = catalogo, agenda, public
AS $$
DECLARE
    v_inicio   timestamptz;
    v_estado   agenda.estado_reserva;
    v_horas    integer;
    v_nuevo    agenda.estado_reserva;
BEGIN
    SELECT lower(franja_clinica), estado INTO v_inicio, v_estado
      FROM agenda.reserva WHERE id = p_reserva_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La reserva % no existe.', p_reserva_id USING ERRCODE = 'no_data_found';
    END IF;

    IF v_estado NOT IN ('pendiente_pago','confirmada','propuesta') THEN
        RAISE EXCEPTION 'Una reserva en estado % no puede cancelarse.', v_estado
              USING ERRCODE = 'check_violation';
    END IF;

    SELECT valor::integer INTO v_horas
      FROM catalogo.parametro WHERE clave = 'horas_minimas_cancelacion';

    -- Fuera de plazo la cita se da por realizada y se pierde el valor
    -- pagado. Por eso 'cancelada_tarde' sigue ocupando la franja y
    -- sigue descontando del paquete.
    v_nuevo := CASE
        WHEN v_inicio - now() >= make_interval(hours => coalesce(v_horas, 24))
        THEN 'cancelada_a_tiempo'::agenda.estado_reserva
        ELSE 'cancelada_tarde'::agenda.estado_reserva
    END;

    UPDATE agenda.reserva
       SET estado = v_nuevo,
           cancelada_en = now(),
           motivo_cancelacion = p_motivo,
           cancelada_por = coalesce(p_por, session_user)
     WHERE id = p_reserva_id;

    UPDATE agenda.reserva_participante
       SET asistencia = 'cancelo'
     WHERE reserva_id = p_reserva_id AND asistencia = 'pendiente';

    RETURN v_nuevo;
END;
$$;

-- ---------------------------------------------------------------------
-- Verificación del pago anticipado del 100%.
-- ---------------------------------------------------------------------

CREATE FUNCTION comercial.verificar_pago(
    p_pago_id bigint,
    p_por     text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = comercial, agenda, personas, public
AS $$
DECLARE
    v_compra_id bigint;
    v_saldo     numeric(12,2);
BEGIN
    UPDATE comercial.pago
       SET estado = 'verificado',
           verificado_en = now(),
           verificado_por = coalesce(p_por, session_user)
     WHERE id = p_pago_id AND estado = 'registrado'
    RETURNING compra_id INTO v_compra_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pago % no existe o ya fue procesado.', p_pago_id
              USING ERRCODE = 'no_data_found';
    END IF;

    IF v_compra_id IS NULL THEN
        RETURN;   -- Pago de convenio: no activa paquetes.
    END IF;

    SELECT saldo_pendiente INTO v_saldo
      FROM comercial.v_saldo_paquete WHERE compra_id = v_compra_id;

    IF v_saldo <= 0 THEN
        UPDATE comercial.compra SET estado = 'activa'
         WHERE id = v_compra_id AND estado = 'pendiente_pago';

        -- La política exige el 100% anticipado, así que las reservas
        -- que esperaban este pago se confirman en bloque.
        UPDATE agenda.reserva r
           SET estado = 'confirmada', reserva_expira_en = NULL
          FROM agenda.reserva_participante rp
         WHERE rp.reserva_id = r.id
           AND rp.compra_id = v_compra_id
           AND r.estado = 'pendiente_pago';

        -- Valoración inicial gratuita al adquirir un paquete de
        -- rehabilitación. Se otorga como derecho, no como tarifa en $0.
        INSERT INTO comercial.beneficio (paciente_id, tipo, origen_compra_id, notas)
        SELECT c.paciente_id, 'valoracion_gratis', c.id,
               'Otorgada automáticamente por la compra de ' || c.tarifa_nombre
          FROM comercial.compra c
          JOIN catalogo.servicio s ON s.id = c.servicio_id
         WHERE c.id = v_compra_id
           AND c.sesiones_incluidas > 1
           AND s.requiere_valoracion_previa
           AND NOT EXISTS (
                 SELECT 1 FROM comercial.beneficio b
                  WHERE b.origen_compra_id = c.id AND b.tipo = 'valoracion_gratis'
               );
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- Programa de referidos.
-- Consume explícitamente los referidos usados para que los mismos cinco
-- pacientes no puedan generar el descuento dos veces.
-- ---------------------------------------------------------------------

CREATE FUNCTION comercial.otorgar_descuento_referidos(p_paciente_id bigint)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = comercial, personas, catalogo, public
AS $$
DECLARE
    v_requeridos integer;
    v_porcentaje numeric(5,2);
    v_ids        bigint[];
    v_beneficio  bigint;
BEGIN
    SELECT valor::integer   INTO v_requeridos FROM catalogo.parametro WHERE clave = 'referidos_para_descuento';
    SELECT valor::numeric   INTO v_porcentaje FROM catalogo.parametro WHERE clave = 'porcentaje_descuento_referidos';

    SELECT ids_referidos INTO v_ids
      FROM comercial.v_referidos_elegibles
     WHERE paciente_referente_id = p_paciente_id;

    IF v_ids IS NULL OR array_length(v_ids, 1) < v_requeridos THEN
        -- Se distinguen los dos casos porque para el paciente no son lo
        -- mismo: uno significa "sigue refiriendo" y el otro "ya lo usaste".
        IF EXISTS (SELECT 1 FROM comercial.beneficio
                    WHERE paciente_id = p_paciente_id AND tipo = 'descuento_referidos') THEN
            RAISE EXCEPTION 'Los referidos actuales ya fueron canjeados. Se requieren % referidos nuevos para un descuento adicional.', v_requeridos
                  USING ERRCODE = 'check_violation';
        ELSE
            RAISE EXCEPTION 'El paciente lleva % referidos efectivos de los % requeridos.',
                  coalesce(array_length(v_ids, 1), 0), v_requeridos
                  USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    INSERT INTO comercial.beneficio (paciente_id, tipo, porcentaje_descuento, notas)
    VALUES (p_paciente_id, 'descuento_referidos', v_porcentaje,
            'Programa de referidos: ' || v_requeridos || ' pacientes referidos que asistieron.')
    RETURNING id INTO v_beneficio;

    -- Se consumen exactamente los primeros N, no todos los elegibles.
    INSERT INTO comercial.beneficio_referido (beneficio_id, paciente_referido_id)
    SELECT v_beneficio, unnest(v_ids[1:v_requeridos]);

    RETURN v_beneficio;
END;
$$;

-- Liberación de cupos que nunca se pagaron.
CREATE FUNCTION agenda.expirar_reservas_vencidas() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE v_n integer;
BEGIN
    UPDATE agenda.reserva
       SET estado = 'expirada',
           motivo_cancelacion = 'Expiró la ventana de pago anticipado'
     WHERE estado = 'pendiente_pago'
       AND reserva_expira_en IS NOT NULL
       AND reserva_expira_en < now();
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- =====================================================================
--  SINCRONIZACIÓN HACIA GOOGLE WORKSPACE
--  El trigger escribe el evento en la misma transacción que el cambio
--  de negocio. n8n lo consume después. Si Google está caído, la cita
--  sigue siendo válida y el espejo se pone al día cuando vuelva.
-- =====================================================================

CREATE FUNCTION integracion.tg_emitir_evento_reserva() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_tipo text;
BEGIN
    v_tipo := CASE
        WHEN TG_OP = 'INSERT' THEN 'reserva.creada'
        WHEN NEW.estado IS DISTINCT FROM OLD.estado THEN 'reserva.estado_cambiado'
        WHEN NEW.franja_bloqueo IS DISTINCT FROM OLD.franja_bloqueo THEN 'reserva.reagendada'
        ELSE NULL
    END;

    IF v_tipo IS NULL THEN
        RETURN NEW;
    END IF;

    -- Las propuestas de la IA no llegan al calendario: todavía no son
    -- compromisos con nadie.
    IF NEW.estado = 'propuesta' THEN
        RETURN NEW;
    END IF;

    INSERT INTO integracion.outbox (
        agregado_tipo, agregado_id, tipo_evento, destino, payload, clave_idempotencia
    ) VALUES (
        'reserva', NEW.id, v_tipo, 'calendar',
        jsonb_build_object(
            'reserva_id',   NEW.id,
            'reserva_uuid', NEW.uuid,
            'estado',       NEW.estado,
            'tipo',         NEW.tipo,
            'sede_id',      NEW.sede_id,
            'servicio_id',  NEW.servicio_id,
            'inicia_en',    lower(NEW.franja_bloqueo),
            'termina_en',   upper(NEW.franja_bloqueo),
            'accion',       CASE
                                WHEN NEW.estado IN ('cancelada_a_tiempo','expirada','rechazada')
                                THEN 'eliminar'
                                ELSE 'upsert'
                            END
        ),
        v_tipo || ':' || NEW.id || ':' || extract(epoch FROM NEW.actualizado_en)::text
    )
    ON CONFLICT (clave_idempotencia) DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE TRIGGER reserva_emite_evento
    AFTER INSERT OR UPDATE ON agenda.reserva
    FOR EACH ROW EXECUTE FUNCTION integracion.tg_emitir_evento_reserva();

-- Toma de trabajo por parte de n8n. Marca los eventos como en proceso
-- de forma atómica para que dos ejecuciones concurrentes del workflow
-- no empujen el mismo evento dos veces a Google.
CREATE FUNCTION integracion.tomar_pendientes(p_limite integer DEFAULT 20)
RETURNS SETOF integracion.outbox
LANGUAGE sql AS $$
    UPDATE integracion.outbox o
       SET estado = 'en_proceso', intentos = o.intentos + 1
     WHERE o.id IN (
           SELECT id FROM integracion.outbox
            WHERE estado IN ('pendiente','fallido')
              AND intentos < max_intentos
              AND disponible_desde <= now()
            ORDER BY id
            LIMIT p_limite
            FOR UPDATE SKIP LOCKED
     )
    RETURNING o.*;
$$;

CREATE FUNCTION integracion.confirmar_sincronizacion(
    p_outbox_id    bigint,
    p_entidad_tipo text,
    p_entidad_id   bigint,
    p_servicio     integracion.servicio_google,
    p_recurso_id   text,
    p_contenedor_id text DEFAULT NULL,
    p_recurso_url  text DEFAULT NULL,
    p_etag         text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO integracion.google_recurso (
        entidad_tipo, entidad_id, servicio, contenedor_id, recurso_id, recurso_url, etag
    ) VALUES (
        p_entidad_tipo, p_entidad_id, p_servicio, p_contenedor_id, p_recurso_id, p_recurso_url, p_etag
    )
    ON CONFLICT (entidad_tipo, entidad_id, servicio) DO UPDATE
       SET recurso_id = EXCLUDED.recurso_id,
           recurso_url = EXCLUDED.recurso_url,
           etag = EXCLUDED.etag,
           sincronizado_en = now();

    UPDATE integracion.outbox
       SET estado = 'completado', procesado_en = now(), ultimo_error = NULL
     WHERE id = p_outbox_id;
END;
$$;

CREATE FUNCTION integracion.registrar_fallo(
    p_outbox_id bigint,
    p_error     text
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE integracion.outbox
       SET estado = CASE WHEN intentos >= max_intentos THEN 'descartado' ELSE 'fallido' END,
           ultimo_error = p_error,
           -- Retroceso exponencial simple: 2, 4, 8, 16, 32 minutos.
           disponible_desde = now() + make_interval(mins => power(2, intentos)::integer)
     WHERE id = p_outbox_id;
END;
$$;

-- =====================================================================
--  PERMISOS
--  El modelo de IA no aparece en esta lista. No tiene rol, no tiene
--  credenciales y no toca la base de datos: sólo produce JSON que otro
--  componente valida.
-- =====================================================================

GRANT USAGE ON SCHEMA catalogo, personas, agenda, comercial, clinico, integracion
    TO fisio_core;
GRANT ALL ON ALL TABLES    IN SCHEMA catalogo, personas, agenda, comercial, clinico, integracion TO fisio_core;
GRANT ALL ON ALL SEQUENCES IN SCHEMA catalogo, personas, agenda, comercial, clinico, integracion TO fisio_core;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA agenda, comercial, integracion TO fisio_core;

-- n8n: lee catálogo y vistas, ejecuta funciones, opera el outbox.
-- No puede insertar ni actualizar reservas por su cuenta.
GRANT USAGE ON SCHEMA catalogo, personas, agenda, comercial, integracion TO fisio_n8n;
GRANT SELECT ON ALL TABLES IN SCHEMA catalogo TO fisio_n8n;
GRANT SELECT ON personas.v_paciente, personas.vinculo_telegram,
                agenda.v_cita,
                comercial.v_saldo_paquete, comercial.v_referidos_elegibles,
                integracion.v_calendar_evento, integracion.v_sheet_agenda,
                integracion.v_sheet_ingresos, integracion.v_sheet_paquetes,
                integracion.google_recurso
    TO fisio_n8n;
GRANT SELECT, INSERT, UPDATE ON integracion.outbox, integracion.notificacion,
                                integracion.mensaje_canal, integracion.propuesta_ia,
                                integracion.ejecucion_n8n TO fisio_n8n;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA integracion TO fisio_n8n;
GRANT EXECUTE ON FUNCTION
    agenda.slots_disponibles(smallint, smallint, date, smallint, integer),
    agenda.crear_reserva(bigint, smallint, smallint, timestamptz, agenda.canal_origen, bigint, integer, smallint, text, smallint),
    agenda.inscribir_participante(bigint, bigint, bigint),
    agenda.cancelar_reserva(bigint, text, text),
    agenda.expirar_reservas_vencidas(),
    comercial.verificar_pago(bigint, text),
    comercial.otorgar_descuento_referidos(bigint),
    integracion.tomar_pendientes(integer),
    integracion.confirmar_sincronizacion(bigint, text, bigint, integracion.servicio_google, text, text, text, text),
    integracion.registrar_fallo(bigint, text)
    TO fisio_n8n;

-- Web pública: catálogo, disponibilidad y reserva. Cero acceso clínico.
GRANT USAGE ON SCHEMA catalogo, agenda, comercial, personas TO fisio_web;
GRANT SELECT ON catalogo.v_tarifa_vigente, catalogo.sede, catalogo.servicio,
                catalogo.tipo_documento, catalogo.eps, catalogo.ciudad,
                catalogo.ocupacion, catalogo.medio_pago TO fisio_web;
GRANT SELECT ON comercial.v_saldo_paquete, agenda.v_cita TO fisio_web;
GRANT INSERT ON personas.paciente, personas.contacto_emergencia, personas.consentimiento TO fisio_web;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA personas TO fisio_web;
GRANT EXECUTE ON FUNCTION
    agenda.slots_disponibles(smallint, smallint, date, smallint, integer),
    agenda.crear_reserva(bigint, smallint, smallint, timestamptz, agenda.canal_origen, bigint, integer, smallint, text, smallint),
    agenda.cancelar_reserva(bigint, text, text)
    TO fisio_web;

-- Volcado a Google Sheets: sólo las vistas planas, ya despojadas de
-- información clínica.
GRANT USAGE  ON SCHEMA integracion TO fisio_reportes;
GRANT SELECT ON integracion.v_sheet_agenda, integracion.v_sheet_ingresos,
                integracion.v_sheet_paquetes TO fisio_reportes;

-- El esquema clínico no se concede a ningún rol automatizado. Sólo el
-- núcleo, autenticado como la profesional, accede a él.
REVOKE ALL ON SCHEMA clinico FROM PUBLIC;