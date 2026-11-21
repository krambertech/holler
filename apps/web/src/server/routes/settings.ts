import { deleteWorkspaceInputSchema, memberRoleInputSchema } from "@holler/core";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { listMembers, setMemberRole } from "../services/members";
import { deleteWorkspace } from "../services/workspace-deletion";
import { workspaceSettings } from "../services/workspaces";
import { requireMember } from "./context";

/** Settings: the workspace and its members. Billing and API keys bring their own routes. */
export const settingsRoutes = new Hono<AppEnv>()
  .get("/workspace", async (c) => c.json(await workspaceSettings(requireMember(c))))
  .delete("/workspace", sValidator("json", deleteWorkspaceInputSchema), async (c) => {
    await deleteWorkspace(requireMember(c), c.env, c.req.valid("json"));
    return c.json({ ok: true as const });
  })
  .get("/members", async (c) => c.json({ members: await listMembers(requireMember(c)) }))
  .put("/members/:id/role", sValidator("json", memberRoleInputSchema), async (c) =>
    c.json(await setMemberRole(requireMember(c), c.req.param("id"), c.req.valid("json").role)),
  );
