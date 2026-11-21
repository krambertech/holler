import { z } from "zod";
import { modes, questionStyles, questionTypes } from "./modes";
import type { Results } from "./results";
import { audienceSchema, hollerStatusSchema, hollerSummarySchema } from "./types";

/**
 * What the public API (`/api/v1`) and the MCP tools return. Inputs live in types.ts; these
 * are the outputs, so the OpenAPI document and the MCP output schemas describe exactly what
 * a caller gets. docs/api.md.
 */

const timestamp = z.iso.datetime();
const scopeSchema = z.enum(["read", "write"]);

export const optionOutSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  label: z.string(),
  score: z.number().int().nullable(),
});

export const questionOutSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  type: z.enum(questionTypes),
  style: z.enum(questionStyles),
  prompt: z.string(),
  required: z.boolean(),
  options: z.array(optionOutSchema),
});

/** One Holler with its questions. Send an `id` back on a question or option to keep it on update. */
export const hollerOutSchema = z.object({
  id: z.string(),
  mode: z.enum(modes),
  status: hollerStatusSchema,
  title: z.string(),
  description: z.string(),
  externalUrl: z.string().nullable(),
  anonymous: z.boolean(),
  visibility: z.enum(["private", "workspace"]),
  tags: z.array(z.string()),
  audience: audienceSchema,
  announceChannelId: z.string().nullable(),
  sendAt: timestamp.nullable(),
  sendInRecipientTimeZone: z.boolean(),
  closeAfterHours: z.number().int(),
  remindersEnabled: z.boolean(),
  sentAt: timestamp.nullable(),
  closesAt: timestamp.nullable(),
  closedAt: timestamp.nullable(),
  createdVia: z.enum(["web", "slack", "api", "mcp"]),
  createdAt: timestamp,
  updatedAt: timestamp,
  /** True when the caller made it, so they may edit, send, close and remind. */
  isCreator: z.boolean(),
  questions: z.array(questionOutSchema),
});
export type HollerOut = z.infer<typeof hollerOutSchema>;

export const hollerListOutSchema = z.object({ hollers: z.array(hollerSummarySchema) });

/** A recipient and whether they answered. Holler knows who answered even when it is anonymous. */
export const recipientOutSchema = z.object({
  slackUserId: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  answered: z.boolean(),
});

export const recipientsOutSchema = z.object({
  recipientCount: z.number().int(),
  answeredCount: z.number().int(),
  waitingCount: z.number().int(),
  recipients: z.array(recipientOutSchema),
});

const optionResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  count: z.number().int(),
  share: z.number().describe("Share of the people who answered this question, 0 to 1."),
  slackUserIds: z.array(z.string()).describe("Who picked it. Empty on an anonymous Holler."),
});

const questionResultSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    prompt: z.string(),
    type: z.enum(["single", "multi"]),
    style: z.enum(questionStyles),
    answeredCount: z.number().int(),
    options: z.array(optionResultSchema),
    average: z.number().nullable().describe("Mean score on a scale question, to one decimal."),
  }),
  z.object({
    id: z.string(),
    prompt: z.string(),
    type: z.literal("text"),
    style: z.enum(questionStyles),
    answeredCount: z.number().int(),
    texts: z.array(z.object({ text: z.string(), slackUserId: z.string().nullable() })),
  }),
]);

/**
 * A Holler's results. An anonymous Holler under five responses is `gated`: counts only,
 * nothing per question, in every door.
 */
export const resultsOutSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("open"),
    responseCount: z.number().int(),
    questions: z.array(questionResultSchema),
  }),
  z.object({
    state: z.literal("gated"),
    responseCount: z.number().int(),
    needed: z.number().int().describe("How many more responses open the results."),
  }),
]);

// The results maths in results.ts is typed by hand; this keeps the two from drifting apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const resultsMatchSchema: Same<Results, z.infer<typeof resultsOutSchema>> = true;

export const directoryOutSchema = z.object({
  people: z.array(
    z.object({
      slackUserId: z.string(),
      name: z.string(),
      displayName: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      timeZone: z.string().nullable(),
    }),
  ),
  groups: z.array(
    z.object({
      slackId: z.string(),
      kind: z.enum(["usergroup", "channel"]),
      name: z.string(),
      handle: z.string().nullable(),
      memberCount: z.number().int().nullable(),
    }),
  ),
});

export const meOutSchema = z.object({
  member: z.object({
    id: z.string(),
    role: z.enum(["owner", "sender"]),
    slackUserId: z.string(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    iconUrl: z.string().nullable(),
    slackDomain: z.string().nullable(),
    installed: z.boolean(),
  }),
  credential: z.object({
    via: z.enum(["web", "api", "mcp"]),
    scope: scopeSchema,
  }),
  usage: z.object({
    plan: z.enum(["free", "team"]),
    sentThisMonth: z.number().int(),
    monthlyLimit: z.number().int().nullable(),
    remaining: z.number().int().nullable(),
  }),
});

export const apiKeyInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scope: scopeSchema.default("read"),
});
export type ApiKeyInput = z.input<typeof apiKeyInputSchema>;

export const apiKeyOutSchema = z.object({
  id: z.string(),
  name: z.string(),
  start: z.string().nullable().describe("The first characters, to tell keys apart."),
  scope: scopeSchema,
  lastUsedAt: timestamp.nullable(),
  createdAt: timestamp,
});
export type ApiKeyOut = z.infer<typeof apiKeyOutSchema>;

export const apiKeyCreatedOutSchema = apiKeyOutSchema.extend({
  key: z.string().describe("The key itself. Shown once; Holler keeps only a hash."),
});
export type ApiKeyCreatedOut = z.infer<typeof apiKeyCreatedOutSchema>;

export const connectedAppOutSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string().nullable(),
  uri: z.string().nullable(),
  scope: scopeSchema,
  connectedAt: timestamp,
  lastUsedAt: timestamp.nullable(),
});
export type ConnectedAppOut = z.infer<typeof connectedAppOutSchema>;

export const okOutSchema = z.object({ ok: z.literal(true) });

export const exportFormatSchema = z.enum(["csv", "md"]);
