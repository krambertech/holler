import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Each service test file boots its own local D1.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
