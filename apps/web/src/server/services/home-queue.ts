import { and, eq, inArray, isNull, lte, or } from "@holler/core/db";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import { queueClaimed } from "./slack-queue";

const { slackHomes } = schema;

export type HomeSend = { kind: "home"; workspaceId: string; slackUserId: string };

export const homeDebounceSeconds = 5;
export const homeClaimStaleMs = 60_000;
const CLAIM_CHUNK = 90;

export async function markHomeOpened(
  db: Db,
  workspaceId: string,
  slackUserId: string,
  now: Date,
): Promise<void> {
  await db
    .insert(slackHomes)
    .values({ workspaceId, slackUserId, openedAt: now })
    .onConflictDoUpdate({
      target: [slackHomes.workspaceId, slackHomes.slackUserId],
      set: { openedAt: now },
    });
}

export async function queueHomes(
  env: Bindings,
  db: Db,
  workspaceId: string,
  slackUserIds: string[],
  now: Date,
  options: { soon?: boolean } = {},
): Promise<number> {
  const people = [...new Set(slackUserIds)];
  const stale = new Date(now.getTime() - homeClaimStaleMs);
  const claimed: string[] = [];
  for (let start = 0; start < people.length; start += CLAIM_CHUNK) {
    const chunk = people.slice(start, start + CLAIM_CHUNK);
    const rows = await db
      .update(slackHomes)
      .set({ queuedAt: now })
      .where(
        and(
          eq(slackHomes.workspaceId, workspaceId),
          inArray(slackHomes.slackUserId, chunk),
          options.soon
            ? undefined
            : or(isNull(slackHomes.queuedAt), lte(slackHomes.queuedAt, stale)),
        ),
      )
      .returning({ slackUserId: slackHomes.slackUserId });
    claimed.push(...rows.map((row) => row.slackUserId));
  }
  const sends: HomeSend[] = claimed.map((slackUserId) => ({
    kind: "home",
    workspaceId,
    slackUserId,
  }));
  await queueClaimed(
    env,
    sends,
    async (unqueued) => {
      const back = unqueued.map((send) => send.slackUserId);
      for (let start = 0; start < back.length; start += CLAIM_CHUNK) {
        await db
          .update(slackHomes)
          .set({ queuedAt: null })
          .where(
            and(
              eq(slackHomes.workspaceId, workspaceId),
              inArray(slackHomes.slackUserId, back.slice(start, start + CLAIM_CHUNK)),
            ),
          );
      }
    },
    options.soon ? {} : { delaySeconds: homeDebounceSeconds },
  );
  return claimed.length;
}

export async function refreshHomes(
  env: Bindings,
  db: Db,
  workspaceId: string,
  slackUserIds: string[],
  now: Date,
  options: { soon?: boolean } = {},
): Promise<void> {
  try {
    await queueHomes(env, db, workspaceId, slackUserIds, now, options);
  } catch (error) {
    console.error("Home refresh not queued; it is rebuilt when opened", error);
  }
}
