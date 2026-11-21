import type { HollerDraftInput } from "@holler/core";
import { eq } from "@holler/core/db";
import { runBatch } from "../batch";
import { schema } from "../db";
import type { ServiceContext } from "./context";
import { createDraft } from "./hollers";

/**
 * Dev routes only: a live survey answered on the web form, with one question of every type, made
 * for the lead and Marta without a send. It never counts against the monthly limit, so browser
 * tests and the verify skill can make as many as they need. A real send is proved in
 * services/respond.test.ts and routes/respond.test.ts.
 */
export const webSurvey = {
  mode: "survey",
  title: "Offsite planning",
  description:
    "Two minutes, so we can **book the place** this week. The [agenda draft](https://example.com/agenda) is up.",
  audience: { people: ["U0LEAD", "U0MK"], groups: [], everyone: false },
  questions: [
    {
      type: "single",
      prompt: "Where would you rather go?",
      options: [{ label: "Lisbon" }, { label: "Tallinn" }, { label: "Riga" }],
      allowOther: true,
      // Tallinn and Other ask why. Only the web form can show a note after some answers.
      followUp: { prompt: "What makes it the right place?", onlyAfter: [1, 3] },
    },
    {
      type: "multi",
      prompt: "Which weeks work for you?",
      description: "All in spring 2027.",
      options: ["8 March", "15 March", "22 March", "29 March", "5 April"].map((label) => ({
        label,
      })),
      maxChoices: 3,
    },
    {
      type: "single",
      style: "scale",
      prompt: "How tired are you of offsites?",
      options: ["1", "2", "3", "4", "5"].map((label) => ({ label })),
      lowLabel: "Not at all",
      highLabel: "Very",
    },
    {
      type: "single",
      style: "binary",
      prompt: "Will you fly?",
      options: [{ label: "Yes" }, { label: "No" }],
    },
    {
      type: "single",
      style: "scale",
      prompt: "The last offsite was a good use of time.",
      options: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"].map(
        (label) => ({ label }),
      ),
    },
    { type: "number", prompt: "How many nights can you stay?", numberMin: 1, numberMax: 7 },
    { type: "person", prompt: "Who should plan it?", maxChoices: 2 },
    { type: "text", prompt: "Anything else we should know?", required: false },
  ],
} satisfies HollerDraftInput;

export async function makeWebSurvey(
  ctx: ServiceContext,
  draft: Partial<HollerDraftInput> = {},
): Promise<{ id: string }> {
  const holler = await createDraft(ctx, { ...webSurvey, ...draft });
  const now = ctx.now();
  await runBatch(ctx.db, [
    ctx.db
      .update(schema.hollers)
      .set({ status: "live", sentAt: now, closesAt: new Date(now.getTime() + 3 * 86_400_000) })
      .where(eq(schema.hollers.id, holler.id)),
    ...webSurvey.audience.people.map((slackUserId) =>
      ctx.db
        .insert(schema.recipients)
        .values({ hollerId: holler.id, slackUserId, addedVia: "person", invitedAt: now }),
    ),
  ]);
  return { id: holler.id };
}
