import { newId } from "@holler/core";
import { type BatchItem, eq, getTableColumns, sql } from "@holler/core/db";
import { type Db, schema } from "../db";
import type { ServiceContext } from "./context";

export interface AuditEntry {
  action: string;
  subjectType: "holler" | "workspace" | "member" | "api_key" | "connected_app";
  subjectId: string;
  data?: Record<string, unknown>;
}

type Statement = BatchItem<"sqlite">;
type ActivityRow = typeof schema.activity.$inferInsert;

const rowOf = Symbol("the Activity row only this file reads");

export interface Activity {
  readonly [rowOf]: ActivityRow;
  then(passItToRecordChange: never): never;
}

export function activityOf(ctx: ServiceContext, entry: AuditEntry): Activity {
  const { actor } = ctx;
  const row: ActivityRow = {
    id: newId("activity"),
    workspaceId: ctx.workspaceId,
    via: actor.via,
    memberId: "memberId" in actor ? (actor.memberId ?? null) : null,
    credentialId: "credentialId" in actor ? actor.credentialId : null,
    action: entry.action,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    data: entry.data ?? null,
    at: ctx.now(),
  };
  return { [rowOf]: row } as Activity;
}

export async function recordChange<T extends Statement>(
  ctx: ServiceContext,
  activity: Activity,
  change: T,
  { before = [], after = [] }: { before?: Statement[]; after?: Statement[] } = {},
): Promise<T["_"]["result"]> {
  const results = await inOneBatch(ctx.db, [
    ...before,
    change,
    insertIfItChanged(ctx.db, activity[rowOf]),
    ...after,
  ]);
  return results[before.length];
}

export async function takeBack(
  ctx: ServiceContext,
  activity: Activity,
  undo: [Statement, ...Statement[]],
): Promise<void> {
  const { id } = activity[rowOf];
  await inOneBatch(ctx.db, [
    ...undo,
    ctx.db.delete(schema.activity).where(eq(schema.activity.id, id)),
  ]);
}

function insertIfItChanged(db: Db, row: ActivityRow): Statement {
  const columns = Object.entries(getTableColumns(schema.activity));
  const values = columns.map(
    ([name, column]) => sql`${sql.param(row[name as keyof ActivityRow] ?? null, column)}`,
  );
  return db
    .insert(schema.activity)
    .select(sql`select ${sql.join(values, sql`, `)} where changes() > 0`);
}

function inOneBatch(db: Db, statements: Statement[]): Promise<unknown[]> {
  return db.batch(statements as [Statement, ...Statement[]]);
}
