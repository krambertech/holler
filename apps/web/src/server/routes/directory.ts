import { directoryResolveInSchema } from "@holler/core";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { lookupDirectory, resolveDirectory, searchDirectory } from "../services/directory";
import { requireMember } from "./context";

export const directoryRoutes = new Hono<AppEnv>()
  .get("/", sValidator("query", z.object({ q: z.string().max(100).default("") })), async (c) =>
    c.json(await searchDirectory(requireMember(c), c.req.valid("query").q)),
  )
  // The people and groups a saved audience names: `?ids=U1,S2`.
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
  // Names, handles or emails pasted as a list, each matched to one person or group.
  .post("/resolve", sValidator("json", directoryResolveInSchema), async (c) =>
    c.json(await resolveDirectory(requireMember(c), c.req.valid("json").terms)),
  );
