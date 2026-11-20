/**
 * Bindings and secrets the Worker expects. `wrangler types` generates the global `Env` from
 * wrangler.jsonc; this adds the secrets, which live in .dev.vars locally and in
 * `wrangler secret` in production.
 */
export interface Bindings extends Env {
  BETTER_AUTH_SECRET: string;
  /** 32 bytes, base64. Encrypts Slack bot tokens at rest. */
  SLACK_TOKEN_KEY: string;
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SLACK_SIGNING_SECRET?: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_WEBHOOK_SECRET?: string;
}

/** The dev personas and /api/dev/* answer only when this is true, which production never sets. */
export function devRoutesEnabled(env: { DEV_ROUTES: string }): boolean {
  return String(env.DEV_ROUTES) === "true";
}
