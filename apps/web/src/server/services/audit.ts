import { type ActivityAction, type activitySubjectTypes, newId } from "@holler/core";
import { schema } from "../db";
import type { ServiceContext } from "./context";

export interface AuditEntry {
  action: ActivityAction;
  subjectType: (typeof activitySubjectTypes)[number];
  subjectId: string;
  /** Never a response's answers, a token or anything a recipient wrote. */
  data?: Record<string, unknown>;
}

/** Records a write for Activity. Every service that writes calls this in the same pass. */
export function auditStatement(ctx: ServiceContext, entry: AuditEntry) {
  const { actor } = ctx;
  return ctx.db.insert(schema.activity).values({
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
  });
}

export async function audit(ctx: ServiceContext, entry: AuditEntry): Promise<void> {
  await auditStatement(ctx, entry);
}
