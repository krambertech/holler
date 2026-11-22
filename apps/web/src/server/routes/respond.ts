import { respondInputSchema, respondLinkSchema } from "@holler/core";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { answerOnWeb, recipientFromLink, respondFormFor, respondPeople } from "../services/respond";

export const respondRoutes = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    await next();
    c.header("cache-control", "no-store");
  })
  .get("/:id", sValidator("query", respondLinkSchema), async (c) => {
    const ctx = await recipientFromLink(
      { db: c.get("db"), now: c.get("now") },
      c.env,
      c.req.param("id"),
      c.req.valid("query"),
    );
    return c.json(await respondFormFor(ctx, c.req.param("id")));
  })
  .post("/:id", sValidator("json", respondInputSchema), async (c) => {
    const { response, ...link } = c.req.valid("json");
    const ctx = await recipientFromLink(
      { db: c.get("db"), now: c.get("now") },
      c.env,
      c.req.param("id"),
      link,
    );
    return c.json(await answerOnWeb(ctx, c.env, c.req.param("id"), response));
  })
  .get(
    "/:id/people",
    sValidator("query", respondLinkSchema.extend({ q: z.string().max(100).default("") })),
    async (c) => {
      const { q, ...link } = c.req.valid("query");
      const ctx = await recipientFromLink(
        { db: c.get("db"), now: c.get("now") },
        c.env,
        c.req.param("id"),
        link,
      );
      return c.json({ people: await respondPeople(ctx, c.req.param("id"), q) });
    },
  );
