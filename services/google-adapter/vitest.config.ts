import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://fisio:pruebas@127.0.0.1:5432/fisio_li_test",
      GOOGLE_ADAPTER_PORT: "8200",
      GOOGLE_CLIENT_ID: "cliente-de-pruebas",
      GOOGLE_CLIENT_SECRET: "secreto-de-pruebas",
      GOOGLE_REDIRECT_URI: "http://localhost:8200/oauth/callback",
      GOOGLE_REFRESH_TOKEN: "refresh-token-de-pruebas",
      TIMEZONE: "America/Bogota",
      LOG_LEVEL: "silent",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/db.ts", "src/setupOauth.ts", "src/googleClients.ts"],
    },
  },
});
