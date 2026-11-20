// Read by `pnpm --filter @holler/web auth:schema`, which writes packages/core/src/schema/auth.ts
// from the plugins createAuth uses. Nothing here runs in the Worker.
import { createAuth } from "./auth";
import type { Db } from "./db";
import type { Bindings } from "./env";

const env = {
  PRODUCT_URL: "http://localhost:5280",
  BETTER_AUTH_SECRET: "cli-only-secret-at-least-thirty-two-characters",
  DEV_ROUTES: "true",
  SLACK_CLIENT_ID: "cli",
  SLACK_CLIENT_SECRET: "cli",
} as unknown as Bindings;

export const auth = createAuth(env, {} as Db);
