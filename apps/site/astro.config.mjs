import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Fully static: every page prerenders, and src/worker.ts answers /api/health in front of them.
export default defineConfig({
  site: "https://holler.team",
  trailingSlash: "never",
  build: { format: "file" },
  vite: { plugins: [tailwindcss()] },
});
