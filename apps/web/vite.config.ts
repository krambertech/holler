import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isE2E = process.env.HOLLER_E2E === "1";

function e2eOrigin() {
  const origin = process.env.HOLLER_E2E_ORIGIN;
  if (!origin)
    throw new Error("Start the e2e server with node e2e/server.mjs, which sets HOLLER_E2E_ORIGIN.");
  return origin;
}

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "src/client/routes",
      generatedRouteTree: "src/client/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    !process.env.VITEST &&
      cloudflare(
        isE2E
          ? {
              persistState: { path: ".wrangler/e2e" },
              inspectorPort: false,
              remoteBindings: false,
              config: {
                vars: {
                  DEV_ROUTES: "true",
                  PRODUCT_URL: e2eOrigin(),
                  PUBLIC_SITE_URL: "http://localhost:5281",
                  BETTER_AUTH_SECRET: "holler-e2e-secret-at-least-thirty-two-characters",
                  SLACK_TOKEN_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                },
              },
            }
          : undefined,
      ),
  ],
  resolve: { tsconfigPaths: true, dedupe: ["react", "react-dom", "@tanstack/react-query"] },
  server: { port: 5280 },
});
