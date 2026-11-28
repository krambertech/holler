import { devSlackInputSchema } from "@holler/core";
import { sValidator } from "@hono/standard-validator";
import { type Context, Hono } from "hono";
import type { AppEnv } from "./app";
import { requireMember } from "./routes/context";
import { DEV_TEAM_ID } from "./services/dev-seed";
import { slackCommandRoutes } from "./slack/commands";
import { slackEventRoutes } from "./slack/events";
import { slackInteractionRoutes } from "./slack/interactions";
import { sign } from "./slack/verify";

const devSigningSecret = "dev-signing-secret";

function slackApp(outer: Context<AppEnv>) {
  return new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set("db", outer.get("db"));
      c.set("auth", outer.get("auth"));
      c.set("now", outer.get("now"));
      c.set("principal", null);
      await next();
    })
    .route("/slack/events", slackEventRoutes)
    .route("/slack/interactions", slackInteractionRoutes)
    .route("/slack/commands", slackCommandRoutes);
}

export const devSlackRoutes = new Hono<AppEnv>().post(
  "/",
  sValidator("json", devSlackInputSchema),
  async (c) => {
    requireMember(c);
    const input = c.req.valid("json");
    const team = { id: DEV_TEAM_ID, domain: "northwind" };
    let body: string;
    let contentType = "application/x-www-form-urlencoded";
    if (input.path === "commands") {
      body = new URLSearchParams({
        command: "/holler",
        text: input.text,
        team_id: team.id,
        user_id: input.as,
        trigger_id: `dev-trigger-${crypto.randomUUID()}`,
      }).toString();
    } else if (input.path === "interactions") {
      const payload = {
        team,
        user: { id: input.as },
        trigger_id: `dev-trigger-${crypto.randomUUID()}`,
        ...input.payload,
      };
      body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
    } else {
      contentType = "application/json";
      body = JSON.stringify({
        type: "event_callback",
        team_id: team.id,
        event_id: `EvDev${crypto.randomUUID()}`,
        event: { user: input.as, ...input.event },
      });
    }
    const secret = c.env.SLACK_SIGNING_SECRET || devSigningSecret;
    const timestamp = String(Math.floor(c.get("now")().getTime() / 1000));
    const request = new Request(new URL(`/slack/${input.path}`, c.req.url), {
      method: "POST",
      body,
      headers: {
        "content-type": contentType,
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": await sign(secret, `v0:${timestamp}:${body}`),
      },
    });
    let executionCtx: typeof c.executionCtx | undefined;
    try {
      executionCtx = c.executionCtx;
    } catch {}
    const response = await slackApp(c).fetch(
      request,
      { ...c.env, SLACK_SIGNING_SECRET: secret },
      executionCtx,
    );
    const text = await response.text();
    return c.json({ status: response.status, body: text ? JSON.parse(text) : null });
  },
);
