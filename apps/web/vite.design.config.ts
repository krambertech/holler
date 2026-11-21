import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The design site: the product's real components, built on their own into dist-design.
export default defineConfig({
  root: "design",
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true, dedupe: ["react", "react-dom"] },
  server: { port: 5282 },
  build: { outDir: "../dist-design", emptyOutDir: true },
});
