import { newId } from "@holler/core";
import { and, type BatchItem, eq, type SQL } from "@holler/core/db";
import { schema } from "../db";
import type { ServiceContext } from "./context";

export interface AuditEntry {
  /** Past-tense and dotted: `holler.created`, `holler.sent`, `reminder.sent`. */
  action: string;
  subjectType: "holler" | "workspace" | "member" | "api_key" | "connected_app";
  subjectId: string;
  /** Never a response's answers, a token or anything a recipient wrote. */
  data?: Record<string, unknown>;
}

/** Records a write for Activity. Every service that writes calls this in the same pass. */
export function auditStatement(ctx: ServiceContext, entry: AuditEntry, id = newId("activity")) {
  const { actor } = ctx;
  return ctx.db.insert(schema.activity).values({
    id,
    workspaceId: ctx.workspaceId,
    via: actor.via,
    memberId: "memberId" in actor ? (actor.memberId ?? null) : null,
    credentialId: "credentialId" in actor ? actor.credentialId : null,
    action: entry.action,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    data: entry.data ?? null,
    at: ctx.now(),
  });
}

export function auditUnless(
  ctx: ServiceContext,
  entry: AuditEntry,
  already: SQL,
): BatchItem<"sqlite">[] {
  const id = newId("activity");
  return [
    auditStatement(ctx, entry, id),
    ctx.db.delete(schema.activity).where(and(eq(schema.activity.id, id), already)),
  ];
}

export async function audit(ctx: ServiceContext, entry: AuditEntry): Promise<void> {
  await auditStatement(ctx, entry);
}
