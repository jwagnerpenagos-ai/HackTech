# Contrato — API de navegador (`apps/web` ↔ `core-api`)

`apps/web/Fisio-Web` (React + Vite) llama **directo** a `core-api`, sin pasar
por n8n: la reserva necesita validarse y bloquear el cupo en una sola
transacción (README raíz, sección 2). En desarrollo el proxy de Vite manda
`/api/*` a `http://localhost:8000`, así que el navegador y la API quedan en
el mismo origen (sin CORS).

Estas rutas viven bajo `/api/*` y están **fuera** del guard `X-Internal-Key`
(que protege `/comandos`, `/pagos/*`, `/asistencia`, para n8n y el bot).

Todas las respuestas son JSON. Errores: `{ "error": "<codigo>", "mensaje"?: "<texto>" }`.
Códigos HTTP: 400 (cuerpo inválido), 401 (sin sesión admin), 404 (no existe),
409 (cupo ya ocupado), 422 (regla de negocio), 429 (rate limit), 500.

---

## Público (sin autenticación)

### `GET /api/servicios`
Servicios reservables por el sitio (los planes grupales/convenios no salen acá).

```json
{ "servicios": [
  { "slug": "valoracion-inicial", "codigo": "VALORACION", "nombre": "Valoración inicial",
    "descripcion": "…", "duracionMin": 60, "precio": 100000, "moneda": "COP" }
] }
```

### `GET /api/sedes`
```json
{ "sedes": [
  { "codigo": "TUNJA", "nombre": "Sede Tunja", "ciudad": "Tunja", "departamento": "Boyacá",
    "dias": [1,2,3,4,5], "nota": "Atención entre semana (lunes a viernes)" }
] }
```
`dias`: convención JS de `Date.getDay()` (0 = domingo).

### `GET /api/disponibilidad?servicio=<slug>&sede=<codigo>&fecha=<YYYY-MM-DD>`
Horas de inicio libres ese día, ya descontados duración, buffer, almuerzo y
anticipación mínima de 24 h. Las calcula `agenda.slots_disponibles` en la base.

```json
{ "servicio": "valoracion-inicial", "sede": "TUNJA", "fecha": "2026-09-20",
  "slots": ["07:00", "07:30", "09:00", "14:00"] }
```
`slots`: `HH:MM` en hora de Bogotá. Lista vacía = ese día no hay cupos (o la
sede no atiende ese día).

### `POST /api/reservas`
Ruta crítica. Valida y **bloquea el cupo atómicamente**. Idempotente por el
header `Idempotency-Key` (un `POST` repetido con la misma clave devuelve la
misma reserva, no crea otra).

Header: `Idempotency-Key: <uuid del cliente>` (obligatorio).

```json
{ "servicio": "valoracion-inicial", "sede": "TUNJA",
  "fecha": "2026-09-20", "hora": "09:00",
  "paciente": {
    "nombre": "Ana Torres", "tipoDocumento": "C.C.", "documento": "1052884331",
    "fechaNacimiento": "1996-04-02", "genero": "Femenino",
    "telefono": "3000000000", "email": "ana@correo.com"
  } }
```
El paciente se busca por documento; si no existe se crea con esos datos. El
resto de la ficha clínica (EPS, ciudad, ocupación, contacto de emergencia,
motivo) es del módulo de historia clínica, no de la reserva — el sitio puede
mandarlo y la API lo ignora sin fallar.

Respuesta `201`:
```json
{ "reservaId": 42, "reservaUuid": "…-uuid", "referencia": "FISIO-…",
  "estado": "pendiente_pago", "monto": 100000, "moneda": "COP",
  "nequi": "3113981422",
  "telegramPago": "https://t.me/FisioLiiBot?start=pago_<reservaUuid>" }
```
La cita nace `pendiente_pago`. **No hay pasarela de pago**: el paciente
transfiere por Nequi y envía el comprobante por Telegram — el sitio muestra
un botón a `telegramPago`. Ese enlace abre el bot con el payload
`pago_<reservaUuid>`; el bot lo reconoce (`/start`), pide la foto del
comprobante y sigue el flujo de pagos que ya existe (`/pagos` del staff →
`comercial.verificar_pago` → cita `confirmada`). Alternativa: Lina confirma
la cita a mano desde el panel.

### `POST /pagos/web/iniciar` — interno (lo llama el bot, guard `X-Internal-Key`)
Body `{ "reserva_uuid": "<uuid>", "chat_id": <n> }`. Busca la reserva por su
uuid público, vincula ese chat de Telegram al paciente si aún no lo está, y
devuelve `{ encontrada, estado, reservaId, compraId, monto, moneda, servicio, iniciaEn }`.
`404` si el uuid no existe.

Errores: `409 cupo_ocupado` (ese horario ya se tomó), `422 anticipacion_insuficiente`
(menos de 24 h), `422 valoracion_requerida` (paciente conocido sin valoración
atendida que pide otro servicio), `400 cuerpo_invalido`.

---

## Admin (sesión de Lina)

Autenticación mínima de un solo usuario. `POST /api/admin/login` con
`WEB_ADMIN_USUARIO` / `WEB_ADMIN_CLAVE` (env de core-api) devuelve un token
firmado (HMAC con `WEB_SESSION_SECRET`). El resto de `/api/admin/*` exige
`Authorization: Bearer <token>`; sin él o vencido → `401`.

### `POST /api/admin/login`
```json
{ "usuario": "lina", "clave": "…" }        →  { "token": "…", "expiraEn": "…" }
```

### `GET /api/admin/citas?desde=<YYYY-MM-DD>&hasta=<YYYY-MM-DD>&sede=<codigo?>`
Agenda del rango (por defecto: hoy + 7 días).
```json
{ "citas": [
  { "reservaId": 42, "estado": "confirmada", "iniciaEn": "…-05:00", "terminaEn": "…-05:00",
    "servicio": "Valoración inicial", "sede": "Sede Tunja", "paciente": "Ana Torres",
    "telefono": "3000000000", "canal": "web" }
] }
```

### `PATCH /api/admin/citas/:id/confirmar`
Marca la cita `confirmada` (equivale a "verifiqué el pago"). `200 { "reservaId", "estado" }`.

### `PATCH /api/admin/citas/:id/cancelar`
Body `{ "motivo"?: "…" }`. Llama `agenda.cancelar_reserva`. `200 { "reservaId", "estado" }`.

### `PATCH /api/admin/citas/:id/asistencia`
Body `{ "asistio": true|false }`. Cierra la cita (`atendida` / `no_asistio`) —
mismo dominio que `/asistencia` del bot.

---

## Pendiente / fuera de este contrato
- Historia clínica (módulos 1–5 del PDF): no hay endpoints todavía.
- `GET /api/admin/pacientes`, `/historial`, `/indicadores`: el panel los llama
  pero por ahora pueden servir datos de ejemplo; se especifican cuando se
  implementen.
- Sesión real con refresh / logout server-side: el token es de vida corta y
  no revocable (suficiente para un único usuario).
