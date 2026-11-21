import { z } from "zod";
import { isChoice, modes, questionStyles, questionTypes, scaleBounds } from "./modes";
import { repeatEvery } from "./repeats";

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

/**
 * An option as the editor and the API send it. The label may be empty while it is a draft;
 * sendProblems refuses to send an empty one. The "Other" write-in is not an option here: it is
 * `allowOther` on the question, and the service keeps one option row for it.
 */
export const optionInputSchema = z.object({
  id: z.string().optional(),
  label: trimmed(150),
  score: z.number().int().nullable().optional(),
});

/**
 * A note asked for after a choice question. `onlyAfter` lists the positions of the options that
 * show it (the Other write-in counts as the position after the last option); null shows it after
 * any answer. Showing it only after some answers needs the web form, because a Slack modal cannot
 * show or hide a field.
 */
export const followUpInputSchema = z.object({
  prompt: trimmed(300),
  onlyAfter: z.array(z.number().int().min(0).max(100)).max(101).nullable().default(null),
});

/**
 * One question as the editor and the API send it. A draft may be half-written: the prompt and
 * option labels may be empty, and sendProblems names whatever must be filled in before sending.
 * The shape itself is checked here, because a wrong shape is a bug, not a half-finished draft.
 */
export const questionInputSchema = z
  .object({
    id: z.string().optional(),
    type: z.enum(questionTypes),
    style: z.enum(questionStyles).default("plain"),
    prompt: trimmed(300).default(""),
    /** One line of help under the prompt. */
    description: trimmed(300).default(""),
    required: z.boolean().default(true),
    options: z.array(optionInputSchema).max(100).default([]),
    /** A plain choice question may add an "Other" option that takes a written answer. */
    allowOther: z.boolean().default(false),
    /** The most options (multiple choice) or people (person) someone may pick. Null is no limit. */
    maxChoices: z.number().int().min(1).max(100).nullable().default(null),
    followUp: followUpInputSchema.nullable().default(null),
    /** Words at the low and high end of a numbered scale. */
    lowLabel: trimmed(60).nullable().default(null),
    highLabel: trimmed(60).nullable().default(null),
    /** The smallest and largest whole number a number question takes. */
    numberMin: z.number().int().min(-1_000_000_000).max(1_000_000_000).nullable().default(null),
    numberMax: z.number().int().min(-1_000_000_000).max(1_000_000_000).nullable().default(null),
  })
  .superRefine((q, ctx) => {
    const issue = (message: string, path: string) =>
      ctx.addIssue({ code: "custom", message, path: [path] });
    const choice = isChoice(q.type);
    if (choice && q.options.length < 2) {
      issue("A choice question needs at least two options.", "options");
    }
    if (!choice && q.options.length > 0) {
      issue("Only a choice question has options.", "options");
    }
    if (q.style !== "plain" && q.type !== "single") {
      issue("Only single choice can be a scale or yes or no.", "style");
    }
    if (q.allowOther && !(choice && q.style === "plain")) {
      issue("Only a plain choice question can add Other.", "allowOther");
    }
    if (q.maxChoices !== null) {
      if (q.type !== "multi" && q.type !== "person") {
        issue("Only multiple choice and person questions have a pick limit.", "maxChoices");
      } else if (q.type === "multi" && q.maxChoices > q.options.length + (q.allowOther ? 1 : 0)) {
        issue("The pick limit is more than the options there are.", "maxChoices");
      }
    }
    if (q.followUp) {
      if (!choice) issue("Only a choice question has a follow-up note.", "followUp");
      const last = q.options.length + (q.allowOther ? 1 : 0) - 1;
      if (q.followUp.onlyAfter?.some((at) => at > last)) {
        issue("The follow-up names an option the question does not have.", "followUp");
      }
    }
    if ((q.lowLabel !== null || q.highLabel !== null) && q.style !== "scale") {
      issue("Only a scale has words at its ends.", "lowLabel");
    }
    if (q.style === "scale" && q.type === "single") {
      const numbered = q.options.every((o) => /^\d+$/.test(o.label));
      if (numbered) {
        const low = Number(q.options[0]?.label);
        const high = Number(q.options.at(-1)?.label);
        if (
          !(scaleBounds.lowest as readonly number[]).includes(low) ||
          high < scaleBounds.highest.min ||
          high > scaleBounds.highest.max
        ) {
          issue("A scale runs from 0 or 1 to between 2 and 10.", "options");
        }
      }
    }
    if ((q.numberMin !== null || q.numberMax !== null) && q.type !== "number") {
      issue("Only a number question has a smallest and largest number.", "numberMin");
    }
    if (q.numberMin !== null && q.numberMax !== null && q.numberMin > q.numberMax) {
      issue("The smallest number is larger than the largest.", "numberMin");
    }
  });
export type QuestionInput = z.input<typeof questionInputSchema>;
export type QuestionDraft = z.output<typeof questionInputSchema>;

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
  /**
   * A fixed close time, such as Friday at 18:00. Null closes it `closeAfterHours` after the last
   * send instead.
   */
  closesAt: z.coerce.date().nullable().default(null),
  closeAfterHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .default(72),
  remindersEnabled: z.boolean().default(true),
  repeat: z.enum(repeatEvery).nullable().default(null),
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
  /** Choice questions: the options picked, the Other option included. */
  optionIds: z.array(z.string()).default([]),
  /** Free text questions. */
  text: z.string().trim().max(4000).nullable().default(null),
  /** Number questions. */
  number: z.number().int().nullable().default(null),
  /** Person questions: the people picked. */
  slackUserIds: z.array(z.string()).max(100).default([]),
  /** What someone wrote beside the Other option. */
  otherText: z.string().trim().max(1000).nullable().default(null),
  /** The follow-up note after a choice question. */
  note: z.string().trim().max(4000).nullable().default(null),
});
export const responseInputSchema = z.object({
  answers: z.array(answerInputSchema).max(30),
});
export type ResponseInput = z.input<typeof responseInputSchema>;

/** Local development only: answers as a recipient, the way their Slack button would. */
export const devAnswerInputSchema = z.object({
  hollerId: z.string(),
  slackUserId: z.string(),
  response: responseInputSchema,
});

/** Local development only: runs the cron's pass as if it fired at `at`, or now. */
export const devTickInputSchema = z.object({ at: z.iso.datetime().optional() });

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

/** Settings › Billing and the limit message. Any member reads it; only owners act on it. */
export const billingOverviewSchema = z.object({
  plan: z.enum(["free", "team"]),
  /** When Team ends after a cancellation, as ISO; null while it renews or on Free. */
  planEndsAt: z.iso.datetime().nullable(),
  sentThisMonth: z.number().int().nonnegative(),
  /** Null on Team, which has no monthly limit. */
  monthlyLimit: z.number().int().positive().nullable(),
  /** When the monthly count starts again: the first of next month, UTC. */
  resetsAt: z.iso.datetime(),
  /** Whether the reader is an owner, who may upgrade and manage billing. */
  canManage: z.boolean(),
  /** Whether Polar knows this workspace, so the customer portal has something to show. */
  hasBillingAccount: z.boolean(),
  /** The owners other than the reader, oldest first, so a sender knows whom to ask. */
  owners: z.array(z.object({ name: z.string() })),
});
export type BillingOverview = z.infer<typeof billingOverviewSchema>;

/** Where to send the browser next: a Polar checkout or the customer portal. */
export const billingRedirectSchema = z.object({ url: z.url() });
export type BillingRedirect = z.infer<typeof billingRedirectSchema>;

export const visibilitySchema = z.enum(["private", "workspace"]);
export const visibilityInputSchema = z.object({ visibility: visibilitySchema });

export const viewersInputSchema = z.object({
  slackUserIds: z.array(z.string().min(1).max(32)).min(1).max(50),
});
export type ViewersInput = z.input<typeof viewersInputSchema>;
