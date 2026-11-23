import { defineConfig, devices } from "@playwright/test";

// The product and the site on their own ports, with dev routes and an isolated local D1.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: true,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:5290", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-phone", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: "node e2e/server.mjs",
    url: "http://localhost:5290/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
