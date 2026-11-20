import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { searchDirectory } from "../services/directory";
import { requireMember } from "./context";

export const directoryRoutes = new Hono<AppEnv>().get(
  "/",
  sValidator("query", z.object({ q: z.string().max(100).default("") })),
  async (c) => c.json(await searchDirectory(requireMember(c), c.req.valid("query").q)),
);
