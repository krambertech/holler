import {
  type DeleteWorkspaceInput,
  keptAfterUninstallDays,
  teamRenews,
  uninstalledBefore,
} from "@holler/core";
import {
  and,
  type BatchItem,
  eq,
  inArray,
  isNotNull,
  lte,
  notExists,
  type SQL,
  sql,
} from "@holler/core/db";
import { inChunks, runBatch } from "../batch";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import type { SlackClient } from "../slack/client";
import { memberOf, ServiceError, type ServiceContext } from "./context";
import { forgetDevSlack, slackFor } from "./slack-connection";

const metadataJson = sql`case when json_valid(${schema.apikey.metadata}) then ${schema.apikey.metadata} end`;
const keyMember = sql`coalesce(
  json_extract(${metadataJson}, '$.memberId'),
  case when json_type(${metadataJson}) = 'text' and json_valid(json_extract(${metadataJson}, '$'))
    then json_extract(json_extract(${metadataJson}, '$'), '$.memberId') end
)`;

export async function deletionStatements(
  db: Db,
  workspaceId: string,
  stillDue?: SQL | undefined,
): Promise<BatchItem<"sqlite">[]> {
  const members = await db
    .select({ id: schema.members.id, userId: schema.members.userId })
    .from(schema.members)
    .where(eq(schema.members.workspaceId, workspaceId));
  const memberIds = members.map((member) => member.id);
  const userIds = [...new Set(members.map((member) => member.userId))];

  const workspaceGone = notExists(
    db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspaceId)),
  );
  return [
    db.delete(schema.workspaces).where(and(eq(schema.workspaces.id, workspaceId), stillDue)),
    ...inChunks(userIds).map((chunk) =>
      // oxlint-disable-next-line holler/activity-with-write -- a deleted workspace keeps no Activity: its own rows go with it
      db
        .delete(schema.apikey)
        .where(
          and(
            inArray(schema.apikey.referenceId, chunk),
            workspaceGone,
            notExists(
              db
                .select({ id: schema.members.id })
                .from(schema.members)
                .where(eq(schema.members.userId, schema.apikey.referenceId)),
            ),
          ),
        ),
    ),
    ...inChunks(memberIds).map((chunk) =>
      // oxlint-disable-next-line holler/activity-with-write -- a deleted workspace keeps no Activity: its own rows go with it
      db.delete(schema.apikey).where(and(inArray(keyMember, chunk), workspaceGone)),
    ),
    ...inChunks(memberIds).flatMap((chunk) => [
      db
        .delete(schema.oauthAccessToken)
        .where(and(inArray(schema.oauthAccessToken.referenceId, chunk), workspaceGone)),
      db
        .delete(schema.oauthRefreshToken)
        .where(and(inArray(schema.oauthRefreshToken.referenceId, chunk), workspaceGone)),
      // oxlint-disable-next-line holler/activity-with-write -- a deleted workspace keeps no Activity: its own rows go with it
      db
        .delete(schema.oauthConsent)
        .where(and(inArray(schema.oauthConsent.referenceId, chunk), workspaceGone)),
    ]),
    ...inChunks(userIds).map((chunk) =>
      db
        .delete(schema.user)
        .where(
          and(
            inArray(schema.user.id, chunk),
            workspaceGone,
            notExists(
              db
                .select({ id: schema.members.id })
                .from(schema.members)
                .where(eq(schema.members.userId, schema.user.id)),
            ),
          ),
        ),
    ),
  ];
}

export async function deleteWorkspace(
  ctx: ServiceContext,
  env: Bindings,
  input: DeleteWorkspaceInput,
): Promise<void> {
  const [row] = await ctx.db
    .select({ role: schema.members.role, workspace: schema.workspaces })
    .from(schema.members)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.members.workspaceId))
    .where(
      and(eq(schema.members.id, memberOf(ctx)), eq(schema.members.workspaceId, ctx.workspaceId)),
    );
  if (!row) throw new ServiceError("not_found", "This workspace no longer exists.");
  const { workspace } = row;
  if (row.role !== "owner") {
    throw new ServiceError(
      "forbidden",
      "Only owners can delete the workspace's data. Ask an owner to do it.",
    );
  }
  if (input.confirmName.trim() !== workspace.name.trim()) {
    throw new ServiceError(
      "invalid",
      `Type ${workspace.name} exactly as it is written to delete its data.`,
      "confirmName",
    );
  }
  if (teamRenews(workspace)) {
    throw new ServiceError(
      "conflict",
      "This workspace still pays for Team. Cancel Team in Manage billing first, then delete its data.",
    );
  }
  const slack: SlackClient | null = await slackFor(env, ctx.db, workspace.id).catch((error) => {
    if (!(error instanceof ServiceError)) {
      console.error("Could not open Slack to remove Holler from a deleted workspace", error);
    }
    return null;
  });
  await runBatch(ctx.db, await deletionStatements(ctx.db, workspace.id));
  forgetDevSlack(workspace.id);
  await slack
    ?.revokeToken()
    .catch((error) =>
      console.error("Could not revoke the bot token of a deleted workspace", error),
    );
  console.info(`Deleted workspace ${workspace.id} at its owner's request`);
}

export function dueForDeletion(now: Date): SQL | undefined {
  return and(
    isNotNull(schema.workspaces.uninstalledAt),
    lte(schema.workspaces.uninstalledAt, uninstalledBefore(now)),
    sql`not (${schema.workspaces.plan} = 'team' and ${schema.workspaces.planEndsAt} is null)`,
  );
}

export async function deleteUninstalledWorkspaces(db: Db, now: Date): Promise<string[]> {
  const due = dueForDeletion(now);
  const workspaces = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(due);
  const deleted: string[] = [];
  for (const { id } of workspaces) {
    await runBatch(db, await deletionStatements(db, id, due));
    const left = await db.query.workspaces.findFirst({
      columns: { id: true },
      where: eq(schema.workspaces.id, id),
    });
    if (!left) {
      deleted.push(id);
      console.info(`Deleted workspace ${id}, ${keptAfterUninstallDays} days after its uninstall`);
    }
  }
  return deleted;
}
