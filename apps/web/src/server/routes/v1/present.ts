import { answerSurface, type HollerOut } from "@holler/core";
import type { getHoller } from "../../services/hollers";

type HollerDetail = Awaited<ReturnType<typeof getHoller>>;

const iso = (at: Date | null) => at?.toISOString() ?? null;

/** A Holler as the API and MCP return it: ISO times, and nothing internal such as the report token. */
export function hollerOut(holler: HollerDetail): HollerOut {
  const questions = holler.questions.map((q) => ({
    id: q.id,
    position: q.position,
    type: q.type,
    style: q.style,
    prompt: q.prompt,
    description: q.description,
    required: q.required,
    // The Other option is `allowOther`, not one of the options a caller edits.
    options: q.options
      .filter((o) => !o.isOther)
      .map((o) => ({
        id: o.id,
        position: o.position,
        label: o.label,
        score: o.score,
        isOther: o.isOther,
      })),
    allowOther: q.options.some((o) => o.isOther),
    maxChoices: q.maxChoices,
    followUp:
      q.followUpPrompt === null ? null : { prompt: q.followUpPrompt, onlyAfter: q.followUpWhen },
    lowLabel: q.lowLabel,
    highLabel: q.highLabel,
    numberMin: q.numberMin,
    numberMax: q.numberMax,
  }));
  return {
    id: holler.id,
    mode: holler.mode,
    status: holler.status,
    title: holler.title,
    description: holler.description,
    externalUrl: holler.externalUrl,
    anonymous: holler.anonymous,
    visibility: holler.visibility,
    tags: holler.tags,
    audience: holler.audience,
    announceChannelId: holler.announceChannelId,
    sendAt: iso(holler.sendAt),
    sendInRecipientTimeZone: holler.sendInRecipientTimeZone,
    closeAfterHours: holler.closeAfterHours,
    answeredIn: answerSurface({ mode: holler.mode, description: holler.description, questions })
      .where,
    remindersEnabled: holler.remindersEnabled,
    sentAt: iso(holler.sentAt),
    closesAt: iso(holler.closesAt),
    closedAt: iso(holler.closedAt),
    createdVia: holler.createdVia,
    createdAt: holler.createdAt.toISOString(),
    updatedAt: holler.updatedAt.toISOString(),
    isCreator: holler.isCreator,
    questions,
  };
}
