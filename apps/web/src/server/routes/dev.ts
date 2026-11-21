import { devAnswerInputSchema, devTickInputSchema } from "@holler/core";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { runCronPass } from "../cron";
import { queueAfterResponse } from "../services/delivery";
import { ensurePersona, isPersona } from "../services/dev-personas";
import { devState, resetDevWorkspace } from "../services/dev-state";
import { recordResponse } from "../services/responses";
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
export const devRoutes = new Hono<AppEnv>()
  .get("/sign-in", async (c) => {
    const as = c.req.query("as") ?? "lead";
    if (!isPersona(as))
      return c.json({ error: { code: "invalid", message: `No persona named ${as}.` } }, 400);
    if (c.req.query("reset") === "1") await resetDevWorkspace(c.get("db"));
    const { email, password } = await ensurePersona(c.get("db"), c.get("auth"), as, c.get("now")());
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
    const { at } = c.req.valid("json");
    const when = at ? new Date(at) : c.get("now")();
    const pass = await runCronPass(c.env, c.get("db"), when);
    return c.json({ at: when.toISOString(), ...pass });
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
  });
