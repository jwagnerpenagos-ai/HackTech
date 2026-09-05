# Base de conocimiento del asistente conversacional

Contexto que usa el bot para responder charla general (intención
`charla_general` en `contracts/intents.schema.json`): quiénes somos,
formación, políticas, qué llevar a la cita, sedes, paquetes, promociones y
contacto.

Precios y disponibilidad puntuales de citas **no** salen de acá: los sirven
`consultar_catalogo` / `consultar_disponibilidad` desde la base de datos.

Contenido real provisto por Lina Murillo (doc `La Fisioterapeuta Li.md` en la
raíz del repo). Al actualizarlo, mantené los fragmentos cortos: todo esto
entra en el prompt del modelo en cada mensaje.

Formato: cada `##` es un fragmento independiente. El servicio los carga todos
(`src/conocimiento.ts`), sin recuperación por palabras clave — el corpus es
chico y cabe entero en el prompt.
