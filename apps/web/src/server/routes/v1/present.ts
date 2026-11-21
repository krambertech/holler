import type { HollerOut } from "@holler/core";
import type { getHoller } from "../../services/hollers";

type HollerDetail = Awaited<ReturnType<typeof getHoller>>;

const iso = (at: Date | null) => at?.toISOString() ?? null;

/** A Holler as the API and MCP return it: ISO times, and nothing internal such as the report token. */
export function hollerOut(holler: HollerDetail): HollerOut {
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
    remindersEnabled: holler.remindersEnabled,
    sentAt: iso(holler.sentAt),
    closesAt: iso(holler.closesAt),
    closedAt: iso(holler.closedAt),
    createdVia: holler.createdVia,
    createdAt: holler.createdAt.toISOString(),
    updatedAt: holler.updatedAt.toISOString(),
    isCreator: holler.isCreator,
    questions: holler.questions.map((q) => ({
      id: q.id,
      position: q.position,
      type: q.type,
      style: q.style,
      prompt: q.prompt,
      required: q.required,
      options: q.options.map((o) => ({
        id: o.id,
        position: o.position,
        label: o.label,
        score: o.score,
      })),
    })),
  };
}
