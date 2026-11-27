import { defineConfig, devices } from "@playwright/test";
import { E2E_ORIGIN } from "./e2e/origin";

// The product and the site on their own ports, with dev routes and an isolated local D1.
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: true,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: E2E_ORIGIN, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-phone", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: "node e2e/server.mjs",
    url: `${E2E_ORIGIN}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
