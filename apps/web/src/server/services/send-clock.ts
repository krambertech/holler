import { earliestInstantOf } from "@holler/core";
import { and, eq } from "@holler/core/db";
import { type Db, schema } from "../db";

const { members, slackPeople } = schema;

export async function timeZoneOf(db: Db, workspaceId: string, slackUserId: string) {
  const person = await db.query.slackPeople.findFirst({
    where: and(eq(slackPeople.workspaceId, workspaceId), eq(slackPeople.slackUserId, slackUserId)),
    columns: { timeZone: true },
  });
  return person?.timeZone ?? null;
}

export async function creatorOf(db: Db, holler: { workspaceId: string; creatorId: string }) {
  const creator = await db.query.members.findFirst({
    where: eq(members.id, holler.creatorId),
    columns: { slackUserId: true },
  });
  if (!creator) throw new Error(`Holler creator ${holler.creatorId} has no member row`);
  return {
    slackUserId: creator.slackUserId,
    timeZone: await timeZoneOf(db, holler.workspaceId, creator.slackUserId),
  };
}

export function goesLiveAt(
  holler: { sendAt: Date | null; sendInRecipientTimeZone: boolean },
  creatorZone: string | null,
) {
  if (!holler.sendAt) return null;
  return holler.sendInRecipientTimeZone
    ? earliestInstantOf(holler.sendAt, creatorZone)
    : holler.sendAt;
}
