import { Hono } from "hono";
import type { AppEnv } from "../app";
import { ensurePersona, isPersona } from "../services/dev-personas";

/**
 * Local development and browser tests only: app.ts mounts these behind DEV_ROUTES.
 * `/api/dev/sign-in?as=lead` signs in as a persona and lands on Home. Never type a Slack
 * password into a test.
 */
export const devRoutes = new Hono<AppEnv>().get("/sign-in", async (c) => {
  const as = c.req.query("as") ?? "lead";
  if (!isPersona(as))
    return c.json({ error: { code: "invalid", message: `No persona named ${as}.` } }, 400);
  const { email, password } = await ensurePersona(c.get("db"), c.get("auth"), as, c.get("now")());
  const signIn = await c.get("auth").api.signInEmail({
    body: { email, password },
    headers: c.req.raw.headers,
    asResponse: true,
  });
  const headers = new Headers({ location: c.req.query("to") ?? "/" });
  for (const cookie of signIn.headers.getSetCookie()) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
});
