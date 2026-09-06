# Seguridad — estado actual y pendientes

Este documento resume qué controles de seguridad ya están en el
frontend, y qué queda en manos del backend/infraestructura (n8n,
hosting, base de datos). Un frontend nunca es "seguro" por sí solo —
la seguridad real vive en el servidor.

## Ya implementado en este frontend

- **Sin `dangerouslySetInnerHTML`**: React escapa todo el contenido
  dinámico por defecto, lo que evita XSS por inyección de HTML.
- **Validación de entradas** con Zod en cada formulario (reserva,
  login): longitudes máximas, formato de email/teléfono, campos
  requeridos — antes de que cualquier dato salga del navegador.
- **Honeypot anti-bots** en el formulario de reserva y de login: un
  campo oculto para personas; si un bot lo rellena, el envío se
  descarta sin llegar al backend.
- **Enlaces externos seguros**: todo `<a target="_blank">` (WhatsApp,
  etc.) lleva `rel="noopener noreferrer"`, para que la pestaña nueva no
  pueda manipular la pestaña de origen.
- **Atributos `autocomplete` correctos** en los formularios (`email`,
  `current-password`, etc.), para que los gestores de contraseñas del
  navegador funcionen bien y no guarden datos en el lugar equivocado.
- **Cabeceras de seguridad HTTP** listas para desplegar:
  `public/_headers` (Netlify) y `vercel.json` (Vercel) — cubren
  `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy` y `Permissions-Policy`. Si el hosting final es otro
  (ej. un servidor propio con Nginx), estas mismas cabeceras se
  configuran ahí.

## Pendiente — responsabilidad del backend / infraestructura

Nada de esto lo puede resolver el frontend por sí solo:

- **Autenticación real**: el login de `/admin/login` hoy no valida
  nada, solo navega. Falta un backend que verifique credenciales,
  emita un token (JWT con expiración corta) y lo valide en cada
  petición al panel admin.
- **Contraseñas con hash** (bcrypt/argon2), nunca en texto plano.
- **HTTPS obligatorio** en producción (lo da el hosting: Vercel,
  Netlify, etc. lo activan por defecto).
- **CORS restringido** al dominio real del sitio, no `*`.
- **Rate limiting** en los endpoints de reserva y login, para evitar
  fuerza bruta y spam (el honeypot ayuda, pero no reemplaza esto).
- **Validación de entradas también en el servidor** — la validación de
  Zod en el frontend es para UX, no para seguridad: cualquiera puede
  saltarse el navegador y pegarle directo a la API.
- **Variables de entorno** para credenciales/tokens de servicios
  (n8n, Google Workspace, etc.) — nunca hardcodeadas en el código del
  frontend, porque el bundle final es público.
- **Auditoría de dependencias**: correr `npm audit` periódicamente
  (ya lo veníamos haciendo desde el laboratorio de seguridad).
