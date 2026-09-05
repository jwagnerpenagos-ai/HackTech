# services/nlu/

Responsable: José

El servicio que interpreta lenguaje natural: recibe el texto que escribe el
administrador en Telegram y devuelve una intención estructurada en JSON,
usando un modelo Ollama local. No tiene credenciales de nada ni ejecuta
acciones — solo interpreta y valida contra el esquema de `contracts/`.

---

## Cómo se garantiza "el sistema valida"

1. El mensaje del usuario entra **siempre** como turno `user` del chat, nunca
   concatenado al prompt de sistema (`src/prompt.ts`).
2. La salida del modelo se fuerza a JSON (`format: "json"`, `temperature: 0`).
3. Ese JSON se valida contra `IntencionSchema` (Zod), espejo estricto de
   `contracts/intents.schema.json`. `test/contract.test.ts` comprueba que
   ambos no divergen.
4. Claves de entidad desconocidas se descartan; `faltantes` se deduplica.
5. Cualquier fallo (no es JSON, no cumple el esquema, Ollama caído o lento)
   devuelve `intencion: "desconocida"` con `_meta.motivo_fallback`. El bot
   sigue operando con comandos estructurados.
6. La intención resultante es inerte: la API núcleo la vuelve a validar antes
   de ejecutar nada.

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/health` | no | Estado del servicio y si Ollama tiene el modelo |
| `POST` | `/interpretar` | `X-Internal-Key` | `{ "mensaje": string, "hoy"?: "YYYY-MM-DD" }` → objeto del contrato + `_meta` |

`X-Internal-Key` se compara en tiempo constante. Es obligatorio con
`NODE_ENV=production`; en desarrollo, si no está, el servicio arranca con una
advertencia.

## Desarrollo

```bash
cd services/nlu
cp .env.example .env.local        # ajusta valores
npm install
npm run dev                       # tsx watch, puerto 8100

npm test                          # vitest (no necesita Ollama: el cliente se inyecta)
npm run lint && npm run typecheck
npm run build                     # -> dist/
```

El modelo se descarga una vez: `ollama pull qwen2.5:7b-instruct` (~4.7 GB).

## Estructura

```
src/
  config.ts      env validado con Zod, falla en el arranque si algo está mal
  logger.ts      pino con redacción de headers y de texto de pacientes
  redact.ts      enmascara correos/números para los logs
  sanitize.ts    normaliza NFC, quita caracteres de control, recorta a 2000
  prompt.ts      prompt de sistema del clasificador (futuro Modelfile)
  contract/
    intents.ts   IntencionSchema (Zod) — espejo de contracts/intents.schema.json
  ollama.ts      cliente /api/chat, sin reintentos, con timeout
  interpret.ts   orquesta: sanea -> modelo -> parsea -> valida -> fallback
  server.ts      Fastify: auth, rate-limit, límite de cuerpo, manejo de errores
  index.ts       arranque y cierre ordenado
test/
  contract.test.ts    Zod ↔ JSON Schema
  interpret.test.ts    fallbacks, inyección, entidades desconocidas
  server.test.ts       auth 401, cuerpo 422, camino feliz
```
