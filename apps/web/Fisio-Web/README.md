# Fisioterapeuta Li — Frontend (HackTech 5.0, Reto 3)

Migrado a **React 19 + Vite + Tailwind CSS v4** (antes Next.js — mismo
diseño y componentes, otro bundler). Resto del stack: React Router,
React Hook Form + Zod, TanStack Query, react-day-picker.

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre http://localhost:5173

## Vistas incluidas

| Ruta | Qué es |
|---|---|
| `/` | Home — hero con silueta interactiva, cómo funciona, preview de servicios, reseñas |
| `/servicios` | Catálogo real de servicios con precios, paquetes, promociones y políticas |
| `/nosotros` | Perfil real de Lina Murillo (formación, certificaciones, sedes) |
| `/reservar` | Flujo de reserva en 4 pasos |
| `/admin/login` | Login del panel administrativo |
| `/admin/agenda` | Dashboard de agenda con métricas y tabla de reservas |

## Qué cambió respecto a la versión Next.js

- Enrutamiento: `react-router-dom` (`src/App.tsx`) en vez de App Router basado en archivos.
- `next/link` → `<Link>` de react-router (prop `to` en vez de `href`).
  El componente `Button` sigue aceptando `href` y decide internamente si
  usa `<Link>` (ruta interna) o `<a target="_blank">` (URL externa, ej. WhatsApp).
- `next/navigation` `useSearchParams` → el de `react-router-dom` (devuelve `[params, setParams]`).
- Fuentes: ya no usan `next/font`, se cargan por `<link>` de Google Fonts en `index.html`.
- Tailwind v4 vía `@tailwindcss/vite` (sin `postcss.config`).
- Alias `@/*` configurado en `vite.config.ts` + `tsconfig.app.json`.

## Qué es real y qué es simulado

Igual que antes: servicios/precios y perfil de Lina son reales (documento
entregado), horarios disponibles y reservas del panel admin son mock
(`src/lib/data.ts`), login admin no valida nada aún, y el envío de la
reserva solo hace `console.log` — ese es el punto de conexión con el
backend/n8n del equipo.

## Diseño

Paleta blanco + azul (tokens en `src/index.css`), tipografía Fraunces +
Inter, motivo de "ola" repetido entre secciones, silueta interactiva en
el hero con puntos vinculados a cada servicio.
