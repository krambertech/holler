import { apiKey } from "@better-auth/api-key";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins/jwt";
import type { Db } from "./db";
import { schema } from "./db";
import { type Bindings, devRoutesEnabled } from "./env";

/**
 * Better Auth is created per request on Workers, because D1 and KV exist only inside one.
 * Construction does no I/O.
 *
 * Members sign in with Slack and nothing else. Email and password exist only when DEV_ROUTES is
 * true, so local development and tests sign in as a persona without a Slack round trip.
 * Linking the Slack identity to a workspace and a member happens in services/members.ts.
 */
export function createAuth(env: Bindings, db: Db) {
  return betterAuth({
    appName: "Holler",
    baseURL: env.PRODUCT_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    secondaryStorage: {
      get: (key) => env.SESSIONS.get(key),
      set: (key, value, ttl) =>
        env.SESSIONS.put(key, value, ttl ? { expirationTtl: Math.max(60, ttl) } : undefined),
      delete: (key) => env.SESSIONS.delete(key),
      getAndDelete: async (key) => {
        const value = await env.SESSIONS.get(key);
        if (value !== null) await env.SESSIONS.delete(key);
        return value;
      },
      // KV has no atomic increment, so rate limits here are approximate per isolate.
      increment: async (key, ttl) => {
        const next = Number((await env.SESSIONS.get(key)) ?? 0) + 1;
        await env.SESSIONS.put(
          key,
          String(next),
          ttl ? { expirationTtl: Math.max(60, ttl) } : undefined,
        );
        return next;
      },
    },
    emailAndPassword: { enabled: devRoutesEnabled(env) },
    socialProviders:
      env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET
        ? {
            slack: {
              clientId: env.SLACK_CLIENT_ID,
              clientSecret: env.SLACK_CLIENT_SECRET,
            },
          }
        : {},
    session: {
      storeSessionInDatabase: true,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      cookiePrefix: "holler",
      database: { generateId: () => crypto.randomUUID() },
    },
    plugins: [
      apiKey({
        defaultPrefix: "hlr_",
        enableMetadata: true,
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 600 },
      }),
      // Signing keys for OAuth access tokens, published at /api/auth/jwks.
      jwt(),
      // This Worker is the OAuth 2.1 authorization server for MCP clients. Tokens are bound to
      // the MCP endpoint. Scopes mirror API keys; offline_access allows a refresh token.
      mcp({
        loginPage: "/sign-in",
        consentPage: "/consent",
        resource: `${env.PRODUCT_URL}/mcp`,
        scopes: ["read", "write", "offline_access"],
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
