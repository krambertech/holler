import { directoryReachInSchema, directoryResolveInSchema } from "@holler/core";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { reachOf } from "../services/audience";
import { lookupDirectory, resolveDirectory, searchDirectory } from "../services/directory";
import { requireMember } from "./context";

export const directoryRoutes = new Hono<AppEnv>()
  .get("/", sValidator("query", z.object({ q: z.string().max(100).default("") })), async (c) =>
    c.json(await searchDirectory(requireMember(c), c.req.valid("query").q)),
  )
  .get(
    "/lookup",
    sValidator("query", z.object({ ids: z.string().max(4000).default("") })),
    async (c) => {
      const ids = c.req
        .valid("query")
        .ids.split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      return c.json(await lookupDirectory(requireMember(c), ids));
    },
  )
  .post("/resolve", sValidator("json", directoryResolveInSchema), async (c) =>
    c.json(await resolveDirectory(requireMember(c), c.req.valid("json").terms)),
  )
  .post("/reach", sValidator("json", directoryReachInSchema), async (c) =>
    c.json(await reachOf(requireMember(c), c.env, c.req.valid("json"))),
  );
