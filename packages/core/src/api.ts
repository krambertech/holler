import { z } from "zod";
import { modes, questionStyles, questionTypes } from "./modes";
import { repeatEvery } from "./repeats";
import type { Results } from "./results";
import {
  audienceSchema,
  hollerStatusSchema,
  hollerSummarySchema,
  responseInputSchema,
} from "./types";

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
  isOther: z.boolean().describe("The Other option, which takes a written answer."),
});

export const questionOutSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  type: z.enum(questionTypes),
  style: z.enum(questionStyles),
  prompt: z.string(),
  description: z.string(),
  required: z.boolean(),
  options: z.array(optionOutSchema),
  allowOther: z.boolean(),
  maxChoices: z.number().int().nullable(),
  followUp: z
    .object({ prompt: z.string(), onlyAfter: z.array(z.number().int()).nullable() })
    .nullable(),
  lowLabel: z.string().nullable(),
  highLabel: z.string().nullable(),
  numberMin: z.number().int().nullable(),
  numberMax: z.number().int().nullable(),
});

/** A reason a Holler cannot be sent yet. `field` is a path such as `questions.0.options.2`. */
export const sendProblemSchema = z.object({ message: z.string(), field: z.string().nullable() });

/** One Holler with its questions. Send an `id` back on a question or option to keep it on update. */
export const hollerOutSchema = z.object({
  id: z.string(),
  mode: z.enum(modes),
  status: hollerStatusSchema,
  title: z.string(),
  displayTitle: z
    .string()
    .describe("What lists show: the title, or a pulse's first question when it has none."),
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
  /** Where it is answered: right in the DM, in a Slack form, on a web page, or a chase. */
  answeredIn: z.enum(["dm", "slack", "web", "chase"]),
  remindersEnabled: z.boolean(),
  repeat: z.enum(repeatEvery).nullable(),
  repeatOfId: z.string().nullable(),
  sentAt: timestamp.nullable(),
  closesAt: timestamp.nullable(),
  closedAt: timestamp.nullable(),
  createdVia: z.enum(["web", "slack", "api", "mcp"]),
  createdAt: timestamp,
  updatedAt: timestamp,
  /** True when the caller made it, so they may edit, send, close and remind. */
  isCreator: z.boolean(),
  problems: z
    .array(sendProblemSchema)
    .describe("Every reason it cannot be sent yet. Empty when it is ready, and once it is sent."),
  questions: z.array(questionOutSchema),
});
export type HollerOut = z.infer<typeof hollerOutSchema>;

/** What a send would do, before it happens: who it reaches, when it closes, what is missing. */
export const sendPreviewOutSchema = z.object({
  hollerId: z.string(),
  title: z.string(),
  reach: z.number().int().describe("About how many people it reaches."),
  people: z.array(z.string()).describe("Up to ten of the people chosen by name."),
  morePeople: z.number().int(),
  groups: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(["usergroup", "channel"]),
      memberCount: z.number().int().nullable(),
    }),
  ),
  everyone: z.boolean(),
  anonymous: z.boolean(),
  sendAt: timestamp.nullable(),
  closesAt: timestamp,
  problems: z.array(sendProblemSchema),
});
export type SendPreview = z.infer<typeof sendPreviewOutSchema>;

export const hollerListOutSchema = z.object({ hollers: z.array(hollerSummarySchema) });

/** A recipient and whether they answered. Holler knows who answered even when it is anonymous. */
export const recipientOutSchema = z.object({
  slackUserId: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  /** Null on an anonymous Holler: its sender sees how many answered, never who. */
  answered: z.boolean().nullable(),
  invited: z.boolean(),
  unreachable: z.boolean(),
});
export type RecipientOut = z.infer<typeof recipientOutSchema>;

export const recipientsOutSchema = z.object({
  recipientCount: z.number().int(),
  answeredCount: z.number().int(),
  waitingCount: z.number().int(),
  recipients: z.array(recipientOutSchema),
  nextReminderAt: timestamp.nullable(),
  reminderAvailableAt: timestamp.nullable(),
});
export type RecipientsOut = z.infer<typeof recipientsOutSchema>;

const writtenSchema = z.object({ text: z.string(), slackUserId: z.string().nullable() });

const optionResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  isOther: z.boolean(),
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
    notes: z.array(writtenSchema).describe("Follow-up notes."),
    otherTexts: z.array(writtenSchema).describe("What people wrote beside Other."),
  }),
  z.object({
    id: z.string(),
    prompt: z.string(),
    type: z.literal("text"),
    style: z.enum(questionStyles),
    answeredCount: z.number().int(),
    texts: z.array(writtenSchema),
  }),
  z.object({
    id: z.string(),
    prompt: z.string(),
    type: z.literal("number"),
    style: z.enum(questionStyles),
    answeredCount: z.number().int(),
    average: z.number().nullable(),
    median: z.number().nullable(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    values: z.array(z.object({ value: z.number(), slackUserId: z.string().nullable() })),
  }),
  z.object({
    id: z.string(),
    prompt: z.string(),
    type: z.literal("person"),
    style: z.enum(questionStyles),
    answeredCount: z.number().int(),
    people: z.array(
      z.object({
        slackUserId: z.string(),
        name: z.string(),
        count: z.number().int(),
        share: z.number(),
        pickedBy: z.array(z.string()).describe("Who picked them. Empty on an anonymous Holler."),
      }),
    ),
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

export const roundOutSchema = z.object({
  id: z.string(),
  status: hollerStatusSchema,
  sendAt: timestamp.nullable(),
  recipientCount: z.number().int(),
  responseCount: z.number().int(),
  gated: z.boolean().describe("An anonymous round under five responses: counts only."),
  scores: z
    .array(
      z.object({
        position: z.number().int(),
        prompt: z.string(),
        average: z.number().nullable(),
        top: z.number().int().describe("The scale's highest score."),
      }),
    )
    .describe("The mean of each scale question, in question order."),
});
export type RoundOut = z.infer<typeof roundOutSchema>;

export const roundsOutSchema = z.object({
  repeat: z.enum(repeatEvery).nullable().describe("The series' rule; null once it stopped."),
  rounds: z.array(roundOutSchema).describe("Newest first, the next scheduled round included."),
});
export type RoundsOut = z.infer<typeof roundsOutSchema>;

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
    deletesAt: z.string().nullable(),
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

export const respondLinkSchema = z.object({
  u: z.string().min(1).max(40),
  s: z.string().min(1).max(100),
});
export type RespondLink = z.infer<typeof respondLinkSchema>;

export const respondQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(questionTypes),
  style: z.enum(questionStyles),
  prompt: z.string(),
  description: z.string(),
  required: z.boolean(),
  options: z.array(
    z.object({
      id: z.string(),
      position: z.number().int(),
      label: z.string(),
      isOther: z.boolean(),
    }),
  ),
  maxChoices: z.number().int().nullable(),
  followUp: z
    .object({ prompt: z.string(), onlyAfter: z.array(z.number().int()).nullable() })
    .nullable(),
  lowLabel: z.string().nullable(),
  highLabel: z.string().nullable(),
  numberMin: z.number().int().nullable(),
  numberMax: z.number().int().nullable(),
});
export type RespondQuestion = z.infer<typeof respondQuestionSchema>;

const respondHollerSchema = z.object({
  id: z.string(),
  mode: z.enum(modes),
  title: z.string(),
  description: z.string(),
  senderName: z.string(),
  senderSlackUserId: z.string(),
  senderAvatarUrl: z.string().nullable(),
  anonymous: z.boolean(),
  closesAt: timestamp.nullable(),
  externalUrl: z.string().nullable(),
});

export const respondFormOutSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("open"),
    holler: respondHollerSchema,
    questions: z.array(respondQuestionSchema),
  }),
  z.object({ state: z.literal("answered"), holler: respondHollerSchema }),
  z.object({ state: z.literal("closed"), holler: respondHollerSchema }),
]);
export type RespondForm = z.infer<typeof respondFormOutSchema>;

export const respondInputSchema = respondLinkSchema.extend({
  response: responseInputSchema,
});

export const respondPersonSchema = z.object({
  slackUserId: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});
export type RespondPerson = z.infer<typeof respondPersonSchema>;
