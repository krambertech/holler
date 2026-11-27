import type { ActivityOut, MemberRole, SettingsWorkspace } from "@holler/core";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ApiAccessSections } from "@/components/api-keys/api-access";
import { PlanSection } from "@/components/billing/plan-section";
import { ActivityRow } from "@/components/settings/activity-row";
import { DeleteWorkspace } from "@/components/settings/delete-workspace";
import { MemberRow } from "@/components/settings/member-row";
import { WorkspaceIcon } from "@/components/settings/workspace-icon";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { Plate, PlateRow, PlateStrip } from "@/components/ui/plate";
import { ApiError, api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { count, dayAndTime, longDate, shortDate } from "@/lib/format";
import { membersQuery, meQuery, workspaceSettingsQuery } from "@/lib/queries";

/**
 * Settings is one page that scrolls: the workspace, its members, then the sections other areas
 * add (the plan, API keys, connected apps). Each of those is one import and one line below.
 * DECISIONS.md, Access.
 */
export const Route = createFileRoute("/_app/settings")({
  component: Settings,
});

function Settings() {
  const me = useQuery(meQuery);
  const isOwner = me.data?.member.role === "owner";
  return (
    <>
      <h1 className="text-4xl tracking-title">Settings</h1>
      <WorkspaceSection isOwner={isOwner} />
      <MembersSection isOwner={isOwner} />
      <PlanSection />
      <ApiAccessSections />
      {isOwner && <ActivitySection />}
      {isOwner && <WorkspaceDataSection />}
    </>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h2 id={id} className="text-lg">
          {title}
        </h2>
        <p className="mt-0.5 max-w-[60ch] text-ink-2">{description}</p>
      </div>
      {children}
    </section>
  );
}

function WorkspaceSection({ isOwner }: { isOwner: boolean }) {
  const workspace = useQuery(workspaceSettingsQuery);
  return (
    <Section
      id="settings-workspace"
      title="Workspace"
      description="The Slack workspace Holler is installed in. Holler reads its people, user groups and channels so you can pick who to ask."
    >
      {workspace.data ? (
        <WorkspacePlate workspace={workspace.data} isOwner={isOwner} />
      ) : workspace.isError ? (
        <Plate className="px-5 py-4 text-danger-ink">
          Unable to load the workspace. Refresh the page to try again.
        </Plate>
      ) : (
        <Plate aria-hidden className="h-[178px] animate-pulse" />
      )}
    </Section>
  );
}

function WorkspacePlate({
  workspace,
  isOwner,
}: {
  workspace: SettingsWorkspace;
  isOwner: boolean;
}) {
  return (
    <Plate>
      <PlateRow className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
        <WorkspaceIcon name={workspace.name} src={workspace.iconUrl} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg">{workspace.name}</span>
          {workspace.slackDomain && (
            <a
              href={`https://${workspace.slackDomain}.slack.com`}
              className="max-w-full truncate text-muted text-sm underline-offset-2 hoverable:hover:text-ink hoverable:hover:underline"
            >
              {workspace.slackDomain}.slack.com
            </a>
          )}
        </div>
        {workspace.installed ? (
          <StatusChip status="answered">Installed</StatusChip>
        ) : (
          <StatusChip status="danger">Not installed</StatusChip>
        )}
      </PlateRow>
      <PlateRow className="grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2">
        {workspace.installedAt && (
          <Fact label="Added to Slack">
            {workspace.installedBy
              ? `${shortDate(workspace.installedAt)} by ${workspace.installedBy}`
              : shortDate(workspace.installedAt)}
          </Fact>
        )}
        <Fact label="People from Slack">
          {workspace.people === 1 ? "1 person" : `${count(workspace.people)} people`}
        </Fact>
        <Fact label="Directory updated">
          {workspace.directorySyncedAt ? dayAndTime(workspace.directorySyncedAt) : "Not yet"}
        </Fact>
      </PlateRow>
      {!workspace.installed ? (
        <PlateStrip>
          <span>
            {workspace.uninstalledAt
              ? `Removed from Slack on ${shortDate(workspace.uninstalledAt)}. Sending is paused, and Holler deletes this workspace’s data on ${longDate(workspace.deletesAt ?? workspace.uninstalledAt)}.`
              : "Holler is not in Slack. Sending is paused."}
          </span>
          {isOwner && (
            <Button size="sm" render={<a href="/slack/oauth/install" />}>
              Add to Slack again
            </Button>
          )}
        </PlateStrip>
      ) : (
        isOwner && (
          <PlateStrip>
            <span>Reinstall when Slack asks Holler for new permissions.</span>
            <Button size="sm" render={<a href="/slack/oauth/install" />}>
              Reinstall
            </Button>
          </PlateStrip>
        )
      )}
    </Plate>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted text-sm">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function MembersSection({ isOwner }: { isOwner: boolean }) {
  const members = useQuery(membersQuery);
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = useMutation({
    mutationFn: ({ id, role }: { id: string; role: MemberRole }) =>
      api(`/settings/members/${id}/role`, { method: "PUT", json: { role } }),
    onMutate: ({ id }) => setErrors(({ [id]: _, ...rest }) => rest),
    onError: (error, { id }) =>
      setErrors((current) => ({
        ...current,
        [id]:
          error instanceof ApiError
            ? error.message
            : "Unable to change the role. Check your connection and try again.",
      })),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: membersQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: meQuery.queryKey }),
      ]),
  });
  const list = members.data ?? [];
  const owners = list.filter((m) => m.role === "owner").length;

  return (
    <Section
      id="settings-members"
      title="Members"
      description="Everyone who signed in to Holler. Anyone in the workspace can sign in and send. Owners also manage roles and billing."
    >
      {members.isError ? (
        <Plate className="px-5 py-4 text-danger-ink">
          Unable to load members. Refresh the page to try again.
        </Plate>
      ) : members.data ? (
        <Plate>
          {list.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              canChangeRole={isOwner}
              onRoleChange={(role) => change.mutate({ id: member.id, role })}
              pending={change.isPending && change.variables?.id === member.id}
              error={errors[member.id] ?? null}
              onlyOwner={member.role === "owner" && owners === 1}
            />
          ))}
          {isOwner && owners === 1 && (
            <PlateStrip>
              <span>You are the only owner. To step down, make someone else an owner first.</span>
            </PlateStrip>
          )}
        </Plate>
      ) : (
        <Plate aria-hidden className="h-[196px] animate-pulse" />
      )}
    </Section>
  );
}

function WorkspaceDataSection() {
  const navigate = useNavigate();
  const workspace = useQuery(workspaceSettingsQuery);
  const [error, setError] = useState<string>();
  if (!workspace.data) return null;
  const name = workspace.data.name;
  async function onDelete(confirmName: string) {
    setError(undefined);
    try {
      await api("/settings/workspace", { method: "DELETE", json: { confirmName } });
      await authClient.signOut().catch(() => undefined);
      await navigate({ to: "/sign-in", search: { deleted: name }, reloadDocument: true });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Holler could not delete the data. Try again.",
      );
    }
  }
  return (
    <Section
      id="settings-workspace-data"
      title="Workspace data"
      description="Holler keeps hollers and answers until an owner deletes them. When Holler is removed from Slack, it deletes everything 90 days later."
    >
      <DeleteWorkspace workspace={workspace.data} onDelete={onDelete} error={error} />
    </Section>
  );
}

function ActivitySection() {
  const activity = useInfiniteQuery({
    queryKey: ["settings", "activity"],
    queryFn: ({ pageParam }) =>
      api<ActivityOut>(
        pageParam
          ? `/settings/activity?cursor=${encodeURIComponent(pageParam)}`
          : "/settings/activity",
      ),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const entries = activity.data?.pages.flatMap((page) => page.entries) ?? [];
  return (
    <Section
      id="settings-activity"
      title="Activity"
      description="Every change in this workspace and who made it, newest first. Only owners see this. It never shows what anyone answered."
    >
      {activity.isError && entries.length === 0 ? (
        <Plate className="px-5 py-4 text-danger-ink">
          Unable to load Activity. Refresh the page to try again.
        </Plate>
      ) : activity.data && entries.length === 0 ? (
        <Plate className="px-5 py-4 text-ink-2">Nothing has happened in this workspace yet.</Plate>
      ) : activity.data ? (
        <Plate>
          <ol aria-label="Activity" className="contents">
            {entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </ol>
          {activity.hasNextPage && (
            <PlateStrip>
              <Button
                size="sm"
                variant="ghost"
                className="-ms-3"
                pending={activity.isFetchingNextPage}
                onClick={() => activity.fetchNextPage()}
              >
                Show older
              </Button>
              {activity.isError && (
                <span className="text-danger-ink">Unable to load more. Try again.</span>
              )}
            </PlateStrip>
          )}
        </Plate>
      ) : (
        <Plate aria-hidden className="h-[196px] animate-pulse" />
      )}
    </Section>
  );
}
