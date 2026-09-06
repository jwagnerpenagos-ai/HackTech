import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    // El sitio llama a la API núcleo por rutas relativas /api/*; en dev el
    // proxy las manda a core-api (puerto 8000). Así no hay CORS.
    proxy: {
      "/api": {
        target: process.env.CORE_API_URL ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
  },
});
