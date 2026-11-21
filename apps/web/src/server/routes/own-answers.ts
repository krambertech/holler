import { Hono } from "hono";
import type { AppEnv } from "../app";
import { listOwnAnswers, ownAnswer } from "../services/own-answers";
import { requireMember } from "./context";

export const ownAnswerRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.json({ hollers: await listOwnAnswers(requireMember(c)) }))
  .get("/:id", async (c) => c.json(await ownAnswer(requireMember(c), c.req.param("id"))));
