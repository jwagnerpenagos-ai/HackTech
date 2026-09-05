# services/google-adapter/

Responsable: Valentina (José asumió esta carpeta también, ver [[jose-scope]] en la memoria del proyecto).

El único servicio con credenciales OAuth de Google. Traduce las órdenes de la
API núcleo a llamadas reales sobre Calendar y Gmail. Ningún otro servicio,
incluido n8n, habla con Google directamente.

## Qué hace hoy

- **Consume `integracion.outbox`** (poll cada `OUTBOX_POLL_INTERVAL_MS`, vía
  `integracion.tomar_pendientes()`): `destino='gmail'` envía el correo;
  `destino='calendar'` crea/actualiza/borra el evento en el calendario **de
  la sede** (`catalogo.sede.google_calendar_id` — cada sede tiene el suyo,
  no hay un calendario único del negocio) y guarda el mapeo reserva↔evento
  en `integracion.google_recurso`.
- **`GET /health`** — chequea PostgreSQL.
- Usa **una sola cuenta de Google (la de Lina/Workspace)** para todo esto.

## Qué falta (fuera de alcance de esta sesión)

- Drive (`crear_carpeta`, `buscar_archivo`) y Sheets: el outbox ya soporta
  `destino='drive'`, pero este consumidor todavía no lo maneja — los eventos
  quedan `fallido` y terminan `descartado` tras agotar los reintentos.
- Fase 3 (Calendar personal del paciente, opcional): endpoints
  `/oauth/paciente/iniciar` y `/oauth/callback`, ver más abajo si ya están
  construidos al momento de leer esto.

## Setup: credenciales de Google

Esto **no se puede automatizar del todo**: Google exige que una persona
autorice explícitamente en el navegador.

1. En [Google Cloud Console](https://console.cloud.google.com/), un proyecto
   con la **Gmail API** y la **Google Calendar API** habilitadas.
2. **Credenciales → Crear credenciales → ID de cliente OAuth**, tipo
   "Aplicación web". Como URI de redirección autorizado, poné exactamente
   `GOOGLE_REDIRECT_URI` (por defecto `http://localhost:8200/oauth/callback`).
3. Copiá `.env.example` a `.env.local` y completá `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` con lo del paso anterior.
4. **Pantalla de consentimiento OAuth**: mientras la app esté en modo
   "Testing" (lo normal para un hackathon — verificarla toma días/semanas),
   agregá como "test user" la cuenta de Gmail de Lina, y cualquier otra
   cuenta con la que se vaya a probar el Calendar personal del paciente
   (fase 3). Sin esto, Google rechaza el login con un error de app no
   verificada.
5. `npm run setup-oauth` — abre un enlace, iniciá sesión **con la cuenta de
   Lina**, autorizá, y el script imprime el `GOOGLE_REFRESH_TOKEN` para
   pegar en `.env.local`. Es un paso único; de ahí en más `googleapis`
   renueva el access token solo.
6. `npm run dev`. Si falta cualquiera de las tres variables de Google, el
   proceso igual levanta (sirve `/health`) pero el consumidor del outbox
   queda apagado con un warning en el log.

## Desarrollo local

```bash
npm install
npm run dev                  # arranca en GOOGLE_ADAPTER_PORT (8200)
npm test                     # pruebas unitarias: Gmail/Calendar inyectados como falsos, no requieren credenciales reales
```
