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
  /** A Polar organization access token. Billing is off until this, the secret and the product are set. */
  POLAR_ACCESS_TOKEN?: string;
  /** From the Polar webhook endpoint. The webhooks plugin checks every delivery's signature with it. */
  POLAR_WEBHOOK_SECRET?: string;
  /** Team's monthly product in Polar ($12). docs/billing.md. */
  POLAR_TEAM_MONTHLY_PRODUCT_ID?: string;
  /** Team's yearly product in Polar ($120). Checkout offers it beside the monthly one. */
  POLAR_TEAM_YEARLY_PRODUCT_ID?: string;
  /** `production` in production; anything else, or unset, is Polar's sandbox. */
  POLAR_SERVER?: string;
}

/** The dev personas and /api/dev/* answer only when this is true, which production never sets. */
export function devRoutesEnabled(env: { DEV_ROUTES: string }): boolean {
  return String(env.DEV_ROUTES) === "true";
}
