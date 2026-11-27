import { activityQuerySchema, memberRoleInputSchema } from "@holler/core";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { listActivity } from "../services/activity";
import { listMembers, setMemberRole } from "../services/members";
import { workspaceSettings } from "../services/workspaces";
import { requireMember } from "./context";

/** Settings: the workspace and its members. Billing and API keys bring their own routes. */
export const settingsRoutes = new Hono<AppEnv>()
  .get("/workspace", async (c) => c.json(await workspaceSettings(requireMember(c))))
  .get("/members", async (c) => c.json({ members: await listMembers(requireMember(c)) }))
  .get("/activity", sValidator("query", activityQuerySchema), async (c) =>
    c.json(await listActivity(requireMember(c), c.req.valid("query"))),
  )
  .put("/members/:id/role", sValidator("json", memberRoleInputSchema), async (c) =>
    c.json(await setMemberRole(requireMember(c), c.req.param("id"), c.req.valid("json").role)),
  );
