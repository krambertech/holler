import type { ActivityEntry, SettingsMember } from "@holler/core";
import { ActivityRow } from "@/components/settings/activity-row";
import { DeleteWorkspace } from "@/components/settings/delete-workspace";
import { MemberRow } from "@/components/settings/member-row";
import { WorkspaceIcon } from "@/components/settings/workspace-icon";
import { Plate } from "@/components/ui/plate";
import { Variants } from "../frame";
import { members } from "../mock";
import type { Group } from "./types";

const [owner, sender] = members as [SettingsMember, SettingsMember];

const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const mira = { slackUserId: "U0LEAD", name: "Mira", avatarUrl: null };
const activity: ActivityEntry[] = [
  {
    id: "a1",
    at: at(5),
    via: "web",
    action: "holler.sent",
    actor: mira,
    subject: { type: "holler", id: "hol_demo", name: "How was your week?", canOpen: true },
    detail: { count: 12 },
  },
  {
    id: "a2",
    at: at(60),
    via: "system",
    action: "holler.reminded",
    actor: null,
    subject: { type: "holler", id: "hol_demo", name: "How was your week?", canOpen: true },
    detail: { count: 1 },
  },
  {
    id: "a3",
    at: at(120),
    via: "web",
    action: "member.role_changed",
    actor: mira,
    subject: { type: "member", id: "mem_demo", name: "Jun", canOpen: false },
    detail: { from: "sender", to: "owner" },
  },
  {
    id: "a4",
    at: at(600),
    via: "slack",
    action: "response.noted",
    actor: null,
    subject: { type: "holler", id: "hol_private", name: "Leadership offsite", canOpen: false },
    detail: {},
  },
  {
    id: "a5",
    at: at(1500),
    via: "api",
    action: "holler.deleted",
    actor: mira,
    subject: { type: "holler", id: "hol_gone", name: null, canOpen: false },
    detail: {},
  },
];

export const settings: Group = {
  slug: "settings",
  title: "Settings",
  lede: "The parts of the Settings page: the Slack workspace Holler lives in, and the people in it with their roles.",
  entries: [
    {
      slug: "delete-workspace",
      name: "DeleteWorkspace",
      source: "components/settings/delete-workspace.tsx",
      note: "Owners only, last on the page. The dialog asks for the workspace's name before the plum Delete data wakes up, and a refused delete says why under the field. While Team renews, the button rests and the line says to cancel first.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Installed",
              render: () => (
                <DeleteWorkspace
                  className="w-full"
                  workspace={{ name: "Northwind", deletesAt: null, teamRenews: false }}
                  onDelete={async () => {}}
                />
              ),
            },
            {
              label: "Removed from Slack",
              render: () => (
                <DeleteWorkspace
                  className="w-full"
                  workspace={{
                    name: "Northwind",
                    deletesAt: "2027-02-19T09:00:00Z",
                    teamRenews: false,
                  }}
                  onDelete={async () => {}}
                />
              ),
            },
            {
              label: "Paying for Team",
              render: () => (
                <DeleteWorkspace
                  className="w-full"
                  workspace={{ name: "Northwind", deletesAt: null, teamRenews: true }}
                  onDelete={async () => {}}
                />
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "workspace-icon",
      name: "WorkspaceIcon",
      source: "components/settings/workspace-icon.tsx",
      note: "Slack's workspace icon, or its initials on a tint tile. The workspace name always sits beside it in words.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Initials",
              render: () => (
                <>
                  <WorkspaceIcon name="Northwind" src={null} />
                  <WorkspaceIcon name="Acme Labs" src={null} size="md" />
                </>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "member-row",
      name: "MemberRow",
      source: "components/settings/member-row.tsx",
      covers: ["RoleSelect"],
      note: "One member: name, when they joined, and their role. An owner changes roles with a native select; everyone else reads a chip. A refused change says why under the row.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "An owner looking",
              render: () => (
                <Plate className="w-full">
                  <MemberRow member={owner} canChangeRole onRoleChange={() => {}} onlyOwner />
                  <MemberRow member={sender} canChangeRole onRoleChange={() => {}} />
                </Plate>
              ),
            },
            {
              label: "Refused and pending",
              render: () => (
                <Plate className="w-full">
                  <MemberRow
                    member={owner}
                    canChangeRole
                    onRoleChange={() => {}}
                    error="A workspace needs at least one owner. Make someone else an owner first."
                  />
                  <MemberRow member={sender} canChangeRole onRoleChange={() => {}} pending />
                </Plate>
              ),
            },
            {
              label: "A sender looking",
              render: () => (
                <Plate className="w-full">
                  <MemberRow member={owner} canChangeRole={false} />
                  <MemberRow member={sender} canChangeRole={false} />
                </Plate>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "activity-row",
      name: "ActivityRow",
      source: "components/settings/activity-row.tsx",
      note: "One write in the workspace, as a sentence: who did what to which Holler, then where it came from and when. Holler's own work and recipients' taps have no person, so they get an icon. It never shows an answer.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Owners only, in Settings",
              render: () => (
                <Plate className="w-full">
                  <ol className="contents">
                    {activity.map((entry) => (
                      <ActivityRow key={entry.id} entry={entry} />
                    ))}
                  </ol>
                </Plate>
              ),
            },
          ]}
        />
      ),
    },
  ],
};
