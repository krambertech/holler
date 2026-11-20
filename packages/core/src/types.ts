import { z } from "zod";
import { modes, questionStyles, questionTypes } from "./modes";

/**
 * The API contract. Every route parses its input with one of these, and every client infers its
 * types from them. Never hand-write a payload type beside a schema.
 */

const trimmed = (max: number) => z.string().trim().max(max);

export const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((tag) => tag.toLocaleLowerCase());

export const optionInputSchema = z.object({
  id: z.string().optional(),
  label: trimmed(150).min(1),
  score: z.number().int().nullable().optional(),
});

export const questionInputSchema = z
  .object({
    id: z.string().optional(),
    type: z.enum(questionTypes),
    style: z.enum(questionStyles).default("plain"),
    prompt: trimmed(300).min(1),
    required: z.boolean().default(true),
    options: z.array(optionInputSchema).max(100).default([]),
  })
  .refine((q) => (q.type === "text" ? q.options.length === 0 : q.options.length >= 2), {
    message: "A choice question needs at least two options, and a text question none.",
    path: ["options"],
  });

export const audienceSchema = z.object({
  /** Slack user ids. */
  people: z.array(z.string()).max(2000).default([]),
  /** Slack user group or channel ids. */
  groups: z.array(z.string()).max(100).default([]),
  everyone: z.boolean().default(false),
});

/** A draft can be saved half-written; sendHollerSchema checks it is complete. */
export const hollerDraftSchema = z.object({
  mode: z.enum(modes),
  title: trimmed(150).default(""),
  description: trimmed(4000).default(""),
  externalUrl: z.url().nullable().default(null),
  anonymous: z.boolean().default(false),
  visibility: z.enum(["private", "workspace"]).default("private"),
  tags: z.array(tagSchema).max(10).default([]),
  audience: audienceSchema.default({ people: [], groups: [], everyone: false }),
  announceChannelId: z.string().nullable().default(null),
  sendAt: z.coerce.date().nullable().default(null),
  sendInRecipientTimeZone: z.boolean().default(false),
  closeAfterHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .default(72),
  remindersEnabled: z.boolean().default(true),
  questions: z.array(questionInputSchema).max(30).default([]),
});
export type HollerDraftInput = z.input<typeof hollerDraftSchema>;
export type HollerDraft = z.output<typeof hollerDraftSchema>;

export const hollerStatusSchema = z.enum(["draft", "scheduled", "live", "closed"]);
export type HollerStatus = z.infer<typeof hollerStatusSchema>;

/** One row on Home and in `GET /api/v1/hollers`. */
export const hollerSummarySchema = z.object({
  id: z.string(),
  mode: z.enum(modes),
  status: hollerStatusSchema,
  title: z.string(),
  anonymous: z.boolean(),
  tags: z.array(z.string()),
  questionCount: z.number().int(),
  recipientCount: z.number().int(),
  answeredCount: z.number().int(),
  sendAt: z.iso.datetime().nullable(),
  sentAt: z.iso.datetime().nullable(),
  closesAt: z.iso.datetime().nullable(),
  closedAt: z.iso.datetime().nullable(),
  creator: z.object({ id: z.string(), name: z.string(), avatarUrl: z.string().nullable() }),
  /** A few recipients for the row's avatar stack, answered first. */
  people: z.array(
    z.object({
      slackUserId: z.string(),
      name: z.string(),
      avatarUrl: z.string().nullable(),
      answered: z.boolean(),
    }),
  ),
});
export type HollerSummary = z.infer<typeof hollerSummarySchema>;

/** Home's three numbers. */
export const homeCountsSchema = z.object({
  live: z.number().int(),
  waiting: z.number().int(),
  scheduled: z.number().int(),
});
export type HomeCounts = z.infer<typeof homeCountsSchema>;

export const listHollersQuerySchema = z.object({
  scope: z.enum(["mine", "shared"]).default("mine"),
  status: hollerStatusSchema.optional(),
  mode: z.enum(modes).optional(),
  tag: z.string().optional(),
  q: z.string().trim().max(100).optional(),
});

/** An answer as it arrives from Slack, the web form or the API. */
export const answerInputSchema = z.object({
  questionId: z.string(),
  optionIds: z.array(z.string()).default([]),
  text: z.string().trim().max(4000).nullable().default(null),
});
export const responseInputSchema = z.object({
  answers: z.array(answerInputSchema).max(30),
});
export type ResponseInput = z.input<typeof responseInputSchema>;

/** Every error the API returns has this shape. `field` names the input at fault, when there is one. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    field: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const memberRoleSchema = z.enum(["owner", "sender"]);
export type MemberRole = z.infer<typeof memberRoleSchema>;

/** `PUT /api/settings/members/:id/role`. Only an owner may, and the last owner stays one. */
export const memberRoleInputSchema = z.object({ role: memberRoleSchema });

/** One row of Settings → Members. */
export const settingsMemberSchema = z.object({
  id: z.string(),
  role: memberRoleSchema,
  slackUserId: z.string(),
  name: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  joinedAt: z.string(),
  isYou: z.boolean(),
});
export type SettingsMember = z.infer<typeof settingsMemberSchema>;

/** Settings → Workspace: the Slack workspace, its install and its directory. */
export const settingsWorkspaceSchema = z.object({
  name: z.string(),
  iconUrl: z.string().nullable(),
  slackDomain: z.string().nullable(),
  installed: z.boolean(),
  uninstalledAt: z.string().nullable(),
  installedAt: z.string().nullable(),
  installedBy: z.string().nullable(),
  people: z.number().int(),
  directorySyncedAt: z.string().nullable(),
});
export type SettingsWorkspace = z.infer<typeof settingsWorkspaceSchema>;

/** `GET /api/install/status`: what the install page shows whoever opened it. */
export const installStatusSchema = z.object({
  signedIn: z.boolean(),
  member: z.boolean(),
  /** The Slack workspace the person last signed in to, when they did. */
  teamName: z.string().nullable(),
  enterprise: z.boolean(),
});
export type InstallStatus = z.infer<typeof installStatusSchema>;
