import type { HollerOut } from "@holler/core";
import { type HollerDetail, presentQuestion } from "../../services/hollers";

const iso = (at: Date | null) => at?.toISOString() ?? null;

/**
 * A Holler as the web app, the API and MCP return it: ISO times, questions in the shape the
 * editor sends back, and nothing internal such as the report token.
 */
export function hollerOut(holler: HollerDetail): HollerOut {
  const questions = holler.questions.map(presentQuestion);
  return {
    id: holler.id,
    mode: holler.mode,
    status: holler.status,
    title: holler.title,
    displayTitle: holler.displayTitle,
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
    answeredIn: holler.answeredIn,
    remindersEnabled: holler.remindersEnabled,
    sentAt: iso(holler.sentAt),
    closesAt: iso(holler.closesAt),
    closedAt: iso(holler.closedAt),
    createdVia: holler.createdVia,
    createdAt: holler.createdAt.toISOString(),
    updatedAt: holler.updatedAt.toISOString(),
    isCreator: holler.isCreator,
    problems: holler.problems,
    questions,
  };
}
