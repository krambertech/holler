import { and, asc, eq, inArray, sql } from "@holler/core/db";
import { schema } from "../db";
import type { ServiceContext } from "./context";

/**
 * People and groups for the audience picker, from Holler's copy of the Slack directory. Matching
 * is on the folded name, so it works in every script. Keeping the copy fresh is the directory
 * sync's job (docs/work-areas.md, Slack install).
 */
export async function searchDirectory(ctx: ServiceContext, query: string, limit = 20) {
  const q = query.trim().toLocaleLowerCase();
  const match = (
    column: typeof schema.slackPeople.searchName | typeof schema.slackGroups.searchName,
  ) => (q ? sql`instr(${column}, ${q}) > 0` : undefined);
  const people = await ctx.db
    .select({
      slackUserId: schema.slackPeople.slackUserId,
      name: schema.slackPeople.name,
      displayName: schema.slackPeople.displayName,
      avatarUrl: schema.slackPeople.avatarUrl,
      timeZone: schema.slackPeople.timeZone,
    })
    .from(schema.slackPeople)
    .where(
      and(
        eq(schema.slackPeople.workspaceId, ctx.workspaceId),
        eq(schema.slackPeople.isBot, false),
        eq(schema.slackPeople.isDeleted, false),
        match(schema.slackPeople.searchName),
      ),
    )
    .orderBy(asc(schema.slackPeople.searchName))
    .limit(limit);
  const groups = await ctx.db
    .select({
      slackId: schema.slackGroups.slackId,
      kind: schema.slackGroups.kind,
      name: schema.slackGroups.name,
      handle: schema.slackGroups.handle,
      memberCount: schema.slackGroups.memberCount,
    })
    .from(schema.slackGroups)
    .where(
      and(
        eq(schema.slackGroups.workspaceId, ctx.workspaceId),
        match(schema.slackGroups.searchName),
      ),
    )
    .orderBy(asc(schema.slackGroups.searchName))
    .limit(limit);
  return { people, groups };
}

/**
 * The people and groups a saved audience names, so a reopened draft shows names, not ids.
 * Deleted people still come back, so a chip can say who it was.
 */
export async function lookupDirectory(ctx: ServiceContext, ids: readonly string[]) {
  const wanted = [...new Set(ids)].slice(0, 200);
  if (wanted.length === 0) return { people: [], groups: [] };
  // D1 binds at most 100 values in one statement.
  const chunks: string[][] = [];
  for (let i = 0; i < wanted.length; i += 90) chunks.push(wanted.slice(i, i + 90));
  const people = [];
  const groups = [];
  for (const chunk of chunks) {
    people.push(
      ...(await ctx.db
        .select({
          slackUserId: schema.slackPeople.slackUserId,
          name: schema.slackPeople.name,
          displayName: schema.slackPeople.displayName,
          avatarUrl: schema.slackPeople.avatarUrl,
          timeZone: schema.slackPeople.timeZone,
        })
        .from(schema.slackPeople)
        .where(
          and(
            eq(schema.slackPeople.workspaceId, ctx.workspaceId),
            inArray(schema.slackPeople.slackUserId, chunk),
          ),
        )),
    );
    groups.push(
      ...(await ctx.db
        .select({
          slackId: schema.slackGroups.slackId,
          kind: schema.slackGroups.kind,
          name: schema.slackGroups.name,
          handle: schema.slackGroups.handle,
          memberCount: schema.slackGroups.memberCount,
        })
        .from(schema.slackGroups)
        .where(
          and(
            eq(schema.slackGroups.workspaceId, ctx.workspaceId),
            inArray(schema.slackGroups.slackId, chunk),
          ),
        )),
    );
  }
  return { people, groups };
}
