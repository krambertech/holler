import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Tests run in a shuffled order, the same order every run, so one that leans on another's
    // leftovers fails here instead of on the day someone adds a test above it.
    sequence: { shuffle: true, seed: 20261121 },
    // Each service test file boots its own local D1.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
