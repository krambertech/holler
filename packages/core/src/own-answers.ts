import { z } from "zod";
import { modes, questionTypes } from "./modes";

const timestamp = z.iso.datetime();

export const ownAnswerStateSchema = z.enum(["waiting", "answered", "missed"]);
export type OwnAnswerState = z.infer<typeof ownAnswerStateSchema>;

export const ownHollerSchema = z.object({
  id: z.string(),
  mode: z.enum(modes),
  title: z.string(),
  anonymous: z.boolean(),
  senderName: z.string(),
  sentAt: timestamp.nullable(),
  closesAt: timestamp.nullable(),
  closedAt: timestamp.nullable(),
  state: ownAnswerStateSchema,
  answeredAt: timestamp.nullable(),
  slackUrl: z.string().nullable(),
});
export type OwnHoller = z.infer<typeof ownHollerSchema>;

export const ownAnswersListSchema = z.array(ownHollerSchema);

export const ownGivenSchema = z.object({
  questionId: z.string(),
  prompt: z.string(),
  type: z.enum(questionTypes),
  picks: z.array(z.string()),
  note: z.string().nullable(),
});
export type OwnGiven = z.infer<typeof ownGivenSchema>;

export const ownAnswerSchema = ownHollerSchema.extend({
  description: z.string(),
  externalUrl: z.string().nullable(),
  given: z.array(ownGivenSchema).nullable(),
});
export type OwnAnswer = z.infer<typeof ownAnswerSchema>;

export function ownAnswerState(input: {
  answeredAt: Date | null;
  status: "draft" | "scheduled" | "live" | "closed";
}): OwnAnswerState {
  if (input.answeredAt) return "answered";
  return input.status === "closed" ? "missed" : "waiting";
}
