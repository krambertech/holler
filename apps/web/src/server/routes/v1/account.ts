import {
  apiKeyCreatedOutSchema,
  apiKeyInputSchema,
  apiKeyOutSchema,
  connectedAppOutSchema,
  directoryOutSchema,
  meOutSchema,
  okOutSchema,
  plans,
  remainingThisMonth,
} from "@holler/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../app";
import { createApiKey, listApiKeys, revokeApiKey } from "../../services/api-keys";
import { disconnectApp, listConnectedApps } from "../../services/connected-apps";
import { searchDirectory } from "../../services/directory";
import { describeMe } from "../../services/members";
import { monthlyUsage } from "../../services/usage";
import { ctxOf, describe, input } from "./http";

const idParam = z.object({ id: z.string().min(1) });

/** Who the credential acts as, and the people and groups a Holler can go to. */
export const v1Account = new Hono<AppEnv>()
  .get(
    "/me",
    describe({
      tags: ["Account"],
      summary: "Who you are",
      description:
        "The member the credential acts as, their workspace, what the credential may do, and this month's sends.",
      ok: { schema: meOutSchema, description: "The caller" },
    }),
    async (c) => {
      const ctx = ctxOf(c);
      const [me, usage] = await Promise.all([describeMe(ctx), monthlyUsage(ctx)]);
      const remaining = remainingThisMonth(usage);
      const principal = c.get("principal");
      return c.json({
        ...me,
        credential: {
          via:
            principal?.actor.via === "api" || principal?.actor.via === "mcp"
              ? principal.actor.via
              : "web",
          scope: principal?.scope ?? "read",
        },
        usage: {
          plan: usage.plan,
          sentThisMonth: usage.sentThisMonth,
          monthlyLimit: Number.isFinite(plans[usage.plan].monthlyHollers)
            ? plans[usage.plan].monthlyHollers
            : null,
          remaining: Number.isFinite(remaining) ? remaining : null,
        },
      });
    },
  )
  .get(
    "/directory",
    describe({
      tags: ["Directory"],
      summary: "Find people and groups",
      description:
        "People, Slack user groups and channels in the workspace, matched on name. Use their ids in a Holler's `audience`.",
      ok: { schema: directoryOutSchema, description: "Up to 20 people and 20 groups" },
      errors: [400],
    }),
    input("query", z.object({ q: z.string().max(100).default("") })),
    async (c) => c.json(await searchDirectory(ctxOf(c), c.req.valid("query").q)),
  )
  .get(
    "/keys",
    describe({
      tags: ["API keys"],
      summary: "List your API keys",
      description: "Web only. Never includes a key itself.",
      sessionOnly: true,
      ok: { schema: z.array(apiKeyOutSchema), description: "Keys, newest first" },
    }),
    async (c) => c.json(await listApiKeys(ctxOf(c))),
  )
  .post(
    "/keys",
    describe({
      tags: ["API keys"],
      summary: "Make an API key",
      description: "Web only. The key is in this response and nowhere else; Holler keeps a hash.",
      sessionOnly: true,
      ok: { status: 201, schema: apiKeyCreatedOutSchema, description: "The new key, once" },
      errors: [400],
    }),
    input("json", apiKeyInputSchema),
    async (c) => c.json(await createApiKey(ctxOf(c), c.get("auth"), c.req.valid("json")), 201),
  )
  .delete(
    "/keys/:id",
    describe({
      tags: ["API keys"],
      summary: "Revoke an API key",
      description: "Web only. Requests with the key fail from the next call.",
      sessionOnly: true,
      ok: { schema: okOutSchema, description: "Revoked" },
      errors: [404],
    }),
    input("param", idParam),
    async (c) => {
      await revokeApiKey(ctxOf(c), c.req.valid("param").id);
      return c.json({ ok: true as const });
    },
  )
  .get(
    "/connected-apps",
    describe({
      tags: ["Connected apps"],
      summary: "List connected apps",
      description: "Web only. The MCP clients you allowed to act for you in this workspace.",
      sessionOnly: true,
      ok: { schema: z.array(connectedAppOutSchema), description: "Connected apps, newest first" },
    }),
    async (c) => c.json(await listConnectedApps(ctxOf(c))),
  )
  .delete(
    "/connected-apps/:id",
    describe({
      tags: ["Connected apps"],
      summary: "Disconnect an app",
      description:
        "Web only. Removes the grant and revokes the app's tokens. Its next request is refused and it has to ask again.",
      sessionOnly: true,
      ok: { schema: okOutSchema, description: "Disconnected" },
      errors: [404],
    }),
    input("param", idParam),
    async (c) => {
      await disconnectApp(ctxOf(c), c.req.valid("param").id);
      return c.json({ ok: true as const });
    },
  );
