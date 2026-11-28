import type { Audience, DirectoryReachOut } from "@holler/core";
import { and, eq } from "@holler/core/db";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import { SlackApiError, type SlackClient } from "../slack/client";
import { type ServiceContext, ServiceError } from "./context";
import { slackFor } from "./slack-connection";

export type GroupMembers = (groupId: string) => Promise<string[]>;

export interface Recipient {
  addedVia: string;
  timeZone: string | null;
}

const isUserGroup = (slackId: string) => slackId.startsWith("S");

export function membersFromSlack(slack: SlackClient): GroupMembers {
  return async (groupId) => {
    if (isUserGroup(groupId)) return slack.userGroupMembers(groupId);
    const members: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await slack.channelMembers(groupId, cursor);
      members.push(...page.members);
      cursor = page.nextCursor || undefined;
    } while (cursor);
    return members;
  };
}

async function reachablePeople(db: Db, workspaceId: string) {
  const rows = await db
    .select({ slackUserId: schema.slackPeople.slackUserId, timeZone: schema.slackPeople.timeZone })
    .from(schema.slackPeople)
    .where(
      and(
        eq(schema.slackPeople.workspaceId, workspaceId),
        eq(schema.slackPeople.isBot, false),
        eq(schema.slackPeople.isDeleted, false),
      ),
    );
  return new Map(rows.map((row) => [row.slackUserId, row.timeZone]));
}

export async function resolveAudience(
  db: Db,
  membersOf: GroupMembers,
  workspaceId: string,
  audience: Audience,
): Promise<Map<string, Recipient>> {
  const firstReason = new Map<string, string>();
  const add = (slackUserId: string, via: string) => {
    if (!firstReason.has(slackUserId)) firstReason.set(slackUserId, via);
  };
  for (const person of audience.people) add(person, "person");
  for (const group of audience.groups) {
    for (const person of await membersOf(group)) add(person, `group:${group}`);
  }
  const reachable = await reachablePeople(db, workspaceId);
  if (audience.everyone) for (const person of reachable.keys()) add(person, "everyone");
  const chosen = new Map<string, Recipient>();
  for (const [slackUserId, addedVia] of firstReason) {
    if (!reachable.has(slackUserId)) continue;
    chosen.set(slackUserId, { addedVia, timeZone: reachable.get(slackUserId) ?? null });
  }
  return chosen;
}

export const MEMBERS_FRESH_FOR_MS = 5 * 60_000;
const MEMBER_LISTS_KEPT = 200;
const recentMembers = new Map<string, { until: number; members: Promise<string[]> }>();

function rememberedMembers(ctx: ServiceContext, membersOf: GroupMembers): GroupMembers {
  return (groupId) => {
    const key = `${ctx.workspaceId}:${groupId}`;
    const now = ctx.now().getTime();
    const kept = recentMembers.get(key);
    if (kept && kept.until > now) return kept.members;
    const members = membersOf(groupId);
    const entry = { until: now + MEMBERS_FRESH_FOR_MS, members };
    recentMembers.delete(key);
    recentMembers.set(key, entry);
    for (const oldest of recentMembers.keys()) {
      if (recentMembers.size <= MEMBER_LISTS_KEPT) break;
      recentMembers.delete(oldest);
    }
    void members.catch(() => {
      if (recentMembers.get(key) === entry) recentMembers.delete(key);
    });
    return members;
  };
}

export async function countReach(
  ctx: ServiceContext,
  slack: SlackClient,
  audience: Audience,
): Promise<DirectoryReachOut> {
  const membersOf = rememberedMembers(ctx, membersFromSlack(slack));
  const chosen = await resolveAudience(ctx.db, membersOf, ctx.workspaceId, audience).catch(
    (error: unknown) => {
      if (!(error instanceof SlackApiError)) throw error;
      throw new ServiceError(
        "slack_unavailable",
        "Slack did not say who is in these groups. Try again in a minute.",
        "audience",
      );
    },
  );
  const byZone = new Map<string | null, number>();
  for (const { timeZone } of chosen.values()) byZone.set(timeZone, (byZone.get(timeZone) ?? 0) + 1);
  return {
    people: chosen.size,
    zones: [...byZone].map(([zone, people]) => ({ zone, people })),
  };
}

export async function reachOf(
  ctx: ServiceContext,
  env: Bindings,
  audience: Audience,
): Promise<DirectoryReachOut> {
  return countReach(ctx, await slackFor(env, ctx.db, ctx.workspaceId), audience);
}
