import {
  devAnswerInputSchema,
  devSlackInputSchema,
  devTickInputSchema,
  devWebSurveyInputSchema,
} from "@holler/core";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { runCronPass } from "../cron";
import { queueAfterResponse } from "../services/delivery";
import {
  DEV_WORKSPACE_HEADER,
  devWorkspace,
  ensurePersonas,
  isPersona,
} from "../services/dev-personas";
import { makeWebSurvey } from "../services/dev-respond";
import { DEV_TEAM_ID } from "../services/dev-seed";
import { devState, resetDevWorkspace } from "../services/dev-state";
import { respondUrl } from "../services/respond-links";
import { recordResponse } from "../services/responses";
import { sign } from "../slack/verify";
import { requireMember } from "./context";

/**
 * Local development and browser tests only: app.ts mounts these behind DEV_ROUTES. The verify
 * skill drives the product through them; docs/testing.md. Never type a Slack password into a test.
 *
 * - `GET /sign-in?as=lead&reset=1&to=/` signs in as a persona. `reset=1` reseeds the dev workspace.
 * - `GET /state` is the stored state a recipe compares with the screen.
 * - `POST /tick` runs the cron's pass at `at`, so a close time can pass without waiting.
 * - `POST /answer` answers as a recipient, the way their Slack button would, and updates their DM.
 */

const devSigningSecret = "dev-signing-secret";
export const devRoutes = new Hono<AppEnv>()
  .get("/sign-in", async (c) => {
    const as = c.req.query("as") ?? "lead";
    if (!isPersona(as))
      return c.json({ error: { code: "invalid", message: `No persona named ${as}.` } }, 400);
    const workspace = devWorkspace(c.req.header(DEV_WORKSPACE_HEADER));
    if (!workspace) {
      const message = `${DEV_WORKSPACE_HEADER} takes 8 to 32 lowercase letters and digits.`;
      return c.json({ error: { code: "invalid", message } }, 400);
    }
    const db = c.get("db");
    if (c.req.query("reset") === "1") await resetDevWorkspace(db, workspace.teamId);
    const now = c.get("now")();
    const { email, password } = await ensurePersonas(db, c.get("auth"), workspace, as, now);
    const signIn = await c.get("auth").api.signInEmail({
      body: { email, password },
      headers: c.req.raw.headers,
      asResponse: true,
    });
    const headers = new Headers({ location: c.req.query("to") ?? "/" });
    for (const cookie of signIn.headers.getSetCookie()) headers.append("set-cookie", cookie);
    return new Response(null, { status: 302, headers });
  })
  .get("/state", async (c) => c.json(await devState(requireMember(c))))
  .post("/tick", sValidator("json", devTickInputSchema), async (c) => {
    if (c.req.header(DEV_WORKSPACE_HEADER) !== undefined) {
      const message =
        "A tick runs every workspace, so a browser test with its own would change the others.";
      return c.json({ error: { code: "conflict", message } }, 409);
    }
    const { at } = c.req.valid("json");
    const when = at ? new Date(at) : c.get("now")();
    const pass = await runCronPass(c.env, c.get("db"), when);
    return c.json({ at: when.toISOString(), ...pass });
  })
  .get("/respond-link", async (c) => {
    requireMember(c);
    const hollerId = c.req.query("holler") ?? "";
    const slackUserId = c.req.query("as") ?? "";
    const url = new URL(await respondUrl(c.env, hollerId, slackUserId));
    return c.json({ url: `${url.pathname}${url.search}` });
  })
  .post("/web-survey", sValidator("json", devWebSurveyInputSchema), async (c) => {
    const ctx = requireMember(c);
    const { id } = await makeWebSurvey(ctx, c.req.valid("json"));
    const url = new URL(await respondUrl(c.env, id, "U0LEAD"));
    return c.json({ id, url: `${url.pathname}${url.search}` }, 201);
  })
  .post("/answer", sValidator("json", devAnswerInputSchema), async (c) => {
    const { hollerId, slackUserId, response } = c.req.valid("json");
    const ctx = requireMember(c);
    const recorded = await recordResponse(
      { ...ctx, actor: { via: "slack", recipientSlackUserId: slackUserId } },
      { hollerId, slackUserId, via: "slack_button", response },
    );
    await queueAfterResponse(c.env, hollerId, slackUserId);
    return c.json(recorded, 201);
  })
  .post("/slack", sValidator("json", devSlackInputSchema), async (c) => {
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
    const { app } = await import("../app");
    let executionCtx: typeof c.executionCtx | undefined;
    try {
      executionCtx = c.executionCtx;
    } catch {}
    const response = await app.fetch(
      request,
      { ...c.env, SLACK_SIGNING_SECRET: secret },
      executionCtx,
    );
    const text = await response.text();
    return c.json({ status: response.status, body: text ? JSON.parse(text) : null });
  });
