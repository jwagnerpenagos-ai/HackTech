# Base de conocimiento del asistente conversacional

Estos `.md` son el contexto que usa el bot para responder charla general
("¿quién sos?", preguntas sobre políticas, qué esperar en la primera cita,
etc. — ver `intencion: "charla_general"` en `contracts/intents.schema.json`).
**No** es de acá de donde salen precios/servicios/horarios — eso ya vive en
la base de datos y lo sirve `consultar_catalogo`/`consultar_disponibilidad`.

**Contenido placeholder**: lo que hay en estos archivos es una plantilla de
ejemplo para que el asistente tenga algo razonable que decir en la demo.
Lina/José deben revisarlo y reemplazar los detalles reales (certificaciones,
políticas exactas, tono) antes de usarlo en producción — nada acá debe
tomarse como información real del consultorio.

Formato: cada `##` es un fragmento independiente que el retrieval
(`src/conocimiento.ts`) puede devolver por separado. Párrafos cortos, en
español, sin tecnicismos — es lo que el modelo va a citar casi textual.
