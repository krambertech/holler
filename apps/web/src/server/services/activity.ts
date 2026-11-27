import type { ActivityEntry, ActivityOut } from "@holler/core";
import { and, desc, eq, inArray, lt, or, sql } from "@holler/core/db";
import { readInChunks } from "../batch";
import { schema } from "../db";
import { memberOf, type ServiceContext, ServiceError } from "./context";
import { visibleTo } from "./hollers";

const { activity, members, slackPeople, hollers, oauthClient } = schema;

export const ACTIVITY_PAGE = 50;

type Detail = ActivityEntry["detail"];

function detailOf(data: Record<string, unknown> | null): Detail {
  if (!data) return {};
  const detail: Detail = {};
  const count = data.recipients;
  if (typeof count === "number" && Number.isInteger(count)) detail.count = count;
  for (const key of ["from", "to", "reason", "name", "role"] as const) {
    const value = data[key];
    if (typeof value === "string") detail[key] = value;
  }
  return detail;
}

function parseCursor(cursor: string | undefined) {
  if (!cursor) return null;
  const [at, id] = cursor.split(":");
  return { at: new Date(Number(at)), id: id ?? "" };
}

async function requireOwner(ctx: ServiceContext) {
  const memberId = memberOf(ctx);
  const member = await ctx.db.query.members.findFirst({
    where: and(eq(members.id, memberId), eq(members.workspaceId, ctx.workspaceId)),
  });
  if (member?.role !== "owner") {
    throw new ServiceError("forbidden", "Only workspace owners see Activity. Ask an owner.");
  }
}

async function namesOfMembers(ctx: ServiceContext, ids: string[]) {
  const rows = await readInChunks(ids, (chunk) =>
    ctx.db
      .select({
        id: members.id,
        slackUserId: members.slackUserId,
        name: slackPeople.name,
        displayName: slackPeople.displayName,
        avatarUrl: slackPeople.avatarUrl,
      })
      .from(members)
      .leftJoin(
        slackPeople,
        and(
          eq(slackPeople.workspaceId, members.workspaceId),
          eq(slackPeople.slackUserId, members.slackUserId),
        ),
      )
      .where(and(eq(members.workspaceId, ctx.workspaceId), inArray(members.id, chunk))),
  );
  return new Map(
    rows.map((r) => [
      r.id,
      {
        slackUserId: r.slackUserId,
        name: r.displayName || r.name || "Someone who left",
        avatarUrl: r.avatarUrl ?? null,
      },
    ]),
  );
}

async function titlesOfHollers(ctx: ServiceContext, ids: string[]) {
  const memberId = memberOf(ctx);
  const rows = await readInChunks(ids, (chunk) =>
    ctx.db
      .select({
        id: hollers.id,
        title: hollers.title,
        canOpen: sql<number>`case when ${visibleTo(ctx, memberId)} then 1 else 0 end`,
      })
      .from(hollers)
      .where(and(eq(hollers.workspaceId, ctx.workspaceId), inArray(hollers.id, chunk))),
  );
  return new Map(rows.map((r) => [r.id, { title: r.title, canOpen: r.canOpen === 1 }]));
}

async function namesOfApps(ctx: ServiceContext, clientIds: string[]) {
  const rows = await readInChunks(clientIds, (chunk) =>
    ctx.db
      .select({ clientId: oauthClient.clientId, name: oauthClient.name })
      .from(oauthClient)
      .where(inArray(oauthClient.clientId, chunk)),
  );
  return new Map(rows.filter((r) => r.name).map((r) => [r.clientId, r.name as string]));
}

export async function listActivity(
  ctx: ServiceContext,
  query: { cursor?: string | undefined },
): Promise<ActivityOut> {
  await requireOwner(ctx);
  const cursor = parseCursor(query.cursor);
  const rows = await ctx.db
    .select()
    .from(activity)
    .where(
      and(
        eq(activity.workspaceId, ctx.workspaceId),
        cursor
          ? or(
              lt(activity.at, cursor.at),
              and(eq(activity.at, cursor.at), lt(activity.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(activity.at), desc(activity.id))
    .limit(ACTIVITY_PAGE + 1);
  const page = rows.slice(0, ACTIVITY_PAGE);
  const unique = (values: (string | null)[]) => [
    ...new Set(values.filter((v): v is string => Boolean(v))),
  ];
  const ofType = (type: string) =>
    page.filter((r) => r.subjectType === type).map((r) => r.subjectId);
  const [people, titles, apps] = await Promise.all([
    namesOfMembers(ctx, unique([...page.map((r) => r.memberId), ...ofType("member")])),
    titlesOfHollers(ctx, unique(ofType("holler"))),
    namesOfApps(ctx, unique(ofType("connected_app"))),
  ]);
  const entries = page.map((row): ActivityEntry => {
    const detail = detailOf(row.data);
    const subjectName =
      row.subjectType === "holler"
        ? (titles.get(row.subjectId)?.title ?? null)
        : row.subjectType === "member"
          ? (people.get(row.subjectId)?.name ?? null)
          : row.subjectType === "connected_app"
            ? (apps.get(row.subjectId) ?? null)
            : row.subjectType === "api_key"
              ? (detail.name ?? null)
              : null;
    return {
      id: row.id,
      at: row.at.toISOString(),
      via: row.via,
      action: row.action,
      actor: row.memberId ? (people.get(row.memberId) ?? null) : null,
      subject: {
        type: row.subjectType,
        id: row.subjectId,
        name: subjectName,
        canOpen: row.subjectType === "holler" && titles.get(row.subjectId)?.canOpen === true,
      },
      detail,
    };
  });
  const last = page.at(-1);
  return {
    entries,
    nextCursor: rows.length > ACTIVITY_PAGE && last ? `${last.at.getTime()}:${last.id}` : null,
  };
}
