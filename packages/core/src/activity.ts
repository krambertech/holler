import { z } from "zod";

export const activityActions = [
  "holler.created",
  "holler.copied",
  "holler.deleted",
  "holler.scheduled",
  "holler.sent",
  "holler.send_failed",
  "holler.reminded",
  "holler.closed",
  "reminder.snoozed",
  "response.noted",
  "member.joined",
  "member.role_changed",
  "plan.changed",
  "api_key.created",
  "api_key.revoked",
  "connected_app.disconnected",
  "workspace.installed",
  "workspace.reinstalled",
  "workspace.uninstalled",
] as const;

export const activitySubjectTypes = [
  "holler",
  "workspace",
  "member",
  "api_key",
  "connected_app",
] as const;

export const activityActionSchema = z.enum(activityActions);
export type ActivityAction = z.infer<typeof activityActionSchema>;

export const activityViaSchema = z.enum(["web", "slack", "api", "mcp", "system"]);
export type ActivityVia = z.infer<typeof activityViaSchema>;

export const activityQuerySchema = z.object({
  cursor: z
    .string()
    .regex(/^\d{1,15}:[A-Za-z0-9_]{1,64}$/)
    .optional(),
});

export const activityEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  via: activityViaSchema,
  action: activityActionSchema,
  actor: z
    .object({ slackUserId: z.string(), name: z.string(), avatarUrl: z.string().nullable() })
    .nullable(),
  subject: z.object({
    type: z.enum(activitySubjectTypes),
    id: z.string(),
    name: z.string().nullable(),
    canOpen: z
      .boolean()
      .describe("True when the reader may open it: a Holler they made, share or see."),
  }),
  detail: z.object({
    count: z.number().int().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    reason: z.string().optional(),
    role: z.string().optional(),
    name: z.string().optional(),
  }),
});
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

export const activityOutSchema = z.object({
  entries: z.array(activityEntrySchema),
  nextCursor: z.string().nullable(),
});
export type ActivityOut = z.infer<typeof activityOutSchema>;
