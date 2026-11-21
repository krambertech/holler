import { apiKey } from "@better-auth/api-key";
import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import { polar, webhooks } from "@polar-sh/better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins/jwt";
import type { Db } from "./db";
import { schema } from "./db";
import { type Bindings, devRoutesEnabled } from "./env";
import { applyPolarEvent, polarClient, polarConfigured } from "./services/billing";
import { fetchClientMetadataResource } from "./mcp/cimd-fetch";
import { API_KEY_PERMISSION, MCP_MEMBER_CLAIM } from "./principal";
import { consentMemberFor } from "./services/connected-apps";
import { linkSlackAccount } from "./services/members";

/**
 * Better Auth is created per request on Workers, because D1 and KV exist only inside one.
 * Construction does no I/O.
 *
 * Members sign in with Slack and nothing else. Email and password exist only when DEV_ROUTES is
 * true, so local development and tests sign in as a persona without a Slack round trip.
 * Linking the Slack identity to a workspace and a member happens in services/members.ts, from the
 * account hooks below: they run on the first sign-in and on every later one, because Better Auth
 * stores the fresh ID token each time.
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
    databaseHooks: {
      account: {
        create: { after: (account) => linkAccount(db, account) },
        update: { after: (account) => linkAccount(db, account) },
      },
    },
    session: {
      storeSessionInDatabase: true,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      cookiePrefix: "holler",
      database: { generateId: () => crypto.randomUUID() },
    },
    plugins: [
      // Keys for scripts. Each is pinned to the member who made it (metadata.memberId) and
      // carries one scope, stored as permissions { holler: ["read"] } or ["read", "write"].
      apiKey({
        defaultPrefix: "hlr_",
        requireName: true,
        // The same bound as apiKeyInputSchema in packages/core.
        maximumNameLength: 60,
        enableMetadata: true,
        // Enough of the key to tell two apart in Settings: "hlr_k3v9q2…".
        startingCharactersConfig: { shouldStore: true, charactersLength: 10 },
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 600 },
        permissions: { defaultPermissions: { [API_KEY_PERMISSION]: ["read"] } },
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
        // MCP 2026-07-28 prefers Client ID Metadata Documents (cimd below). Dynamic
        // registration stays open for clients that have not moved yet.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        // A connection acts in the workspace the person was in when they approved it, so it
        // never switches teams because they later signed in somewhere else.
        postLogin: {
          page: "/consent",
          shouldRedirect: () => false,
          consentReferenceId: async ({ user }) => {
            const memberId = await consentMemberFor(db, user.id);
            if (!memberId)
              throw new Error("This Slack account is not in a workspace that installed Holler.");
            return memberId;
          },
        },
        customAccessTokenClaims: ({ referenceId }) =>
          referenceId ? { [MCP_MEMBER_CLAIM]: referenceId } : {},
      }),
      // Clients identify themselves with a metadata document at their client_id URL.
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
      // Polar's webhooks, at /api/auth/polar/webhooks. The plugin checks the signature; billing.ts
      // is the only thing that changes the plan. Checkout and the portal are Holler routes in
      // routes/billing.ts, because the Polar customer is the workspace, not the signed-in person.
      ...(polarConfigured(env)
        ? [
            polar({
              client: polarClient(env),
              use: [
                webhooks({
                  secret: env.POLAR_WEBHOOK_SECRET,
                  onPayload: async (payload) => {
                    await applyPolarEvent({ db, now: () => new Date() }, payload);
                  },
                }),
              ],
            }),
          ]
        : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

async function linkAccount(
  db: Db,
  account: { userId?: string; providerId?: string; idToken?: string | null | undefined } | null,
) {
  if (!account?.userId || !account.providerId) return;
  await linkSlackAccount(
    db,
    { userId: account.userId, providerId: account.providerId, idToken: account.idToken },
    new Date(),
  );
}
