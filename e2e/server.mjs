// Starts the product for browser tests: a fresh local D1 under .wrangler/e2e, migrated, then Vite.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { E2E_ORIGIN, E2E_PORT } from "./origin.ts";

const web = resolve(import.meta.dirname, "../apps/web");
const env = { ...process.env, HOLLER_E2E: "1", HOLLER_E2E_ORIGIN: E2E_ORIGIN };

rmSync(resolve(web, ".wrangler/e2e"), { recursive: true, force: true });
const migrate = spawnSync(
  "pnpm",
  [
    "exec",
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "holler",
    "--local",
    "--persist-to",
    ".wrangler/e2e",
  ],
  { cwd: web, env, stdio: "inherit" },
);
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const vite = spawn("pnpm", ["exec", "vite", "--port", String(E2E_PORT), "--strictPort"], {
  cwd: web,
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => vite.kill(signal));
vite.on("exit", (code) => process.exit(code ?? 0));
