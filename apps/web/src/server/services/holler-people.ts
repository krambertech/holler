import { and, asc, eq } from "@holler/core/db";
import { schema } from "../db";
import type { ServiceContext } from "./context";
import { getHoller } from "./hollers";

/**
 * Who a Holler went to and who answered, for the API and MCP. Holler knows who answered even
 * on an anonymous Holler, because that is how it stops reminding them; it never knows which
 * response is theirs. Answered people come first.
 */
export async function hollerPeople(ctx: ServiceContext, hollerId: string) {
  // getHoller throws not_found unless the member may see it.
  await getHoller(ctx, hollerId);
  const rows = await ctx.db
    .select({
      slackUserId: schema.recipients.slackUserId,
      answeredAt: schema.recipients.answeredAt,
      name: schema.slackPeople.name,
      displayName: schema.slackPeople.displayName,
      avatarUrl: schema.slackPeople.avatarUrl,
    })
    .from(schema.recipients)
    .leftJoin(
      schema.slackPeople,
      and(
        eq(schema.slackPeople.workspaceId, ctx.workspaceId),
        eq(schema.slackPeople.slackUserId, schema.recipients.slackUserId),
      ),
    )
    .where(eq(schema.recipients.hollerId, hollerId))
    .orderBy(asc(schema.slackPeople.searchName));
  const recipients = rows
    .map((row) => ({
      slackUserId: row.slackUserId,
      name: row.displayName || row.name || row.slackUserId,
      avatarUrl: row.avatarUrl ?? null,
      answered: row.answeredAt != null,
    }))
    .sort((a, b) => Number(b.answered) - Number(a.answered));
  const answeredCount = recipients.filter((r) => r.answered).length;
  return {
    recipientCount: recipients.length,
    answeredCount,
    waitingCount: recipients.length - answeredCount,
    recipients,
  };
}
