import type { SettingsMember } from "@holler/core";
import { DeleteWorkspace } from "@/components/settings/delete-workspace";
import { MemberRow } from "@/components/settings/member-row";
import { WorkspaceIcon } from "@/components/settings/workspace-icon";
import { Plate } from "@/components/ui/plate";
import { Variants } from "../frame";
import { members } from "../mock";
import type { Group } from "./types";

const [owner, sender] = members as [SettingsMember, SettingsMember];

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
  ],
};
