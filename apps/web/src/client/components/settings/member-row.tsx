import type { MemberRole, SettingsMember } from "@holler/core";
import type { ComponentProps } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { PlateRow } from "@/components/ui/plate";
import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/format";
import { RoleSelect } from "./role-select";

const roleLabel: Record<MemberRole, string> = { owner: "Owner", sender: "Sender" };

interface Props extends ComponentProps<typeof PlateRow> {
  member: SettingsMember;
  /** True when the person looking is an owner, who may change roles. */
  canChangeRole: boolean;
  onRoleChange?: ((role: MemberRole) => void) | undefined;
  pending?: boolean | undefined;
  error?: string | null | undefined;
  /** This member is the workspace's only owner. */
  onlyOwner?: boolean | undefined;
}

/** One member in Settings: who they are, when they joined, and their role. */
function MemberRow({
  member,
  canChangeRole,
  onRoleChange,
  pending = false,
  error,
  onlyOwner = false,
  className,
  ...props
}: Props) {
  const errorId = `role-error-${member.id}`;
  return (
    <PlateRow
      data-slot="member-row"
      className={cn("flex flex-col gap-2 px-5 py-3.5", className)}
      {...props}
    >
      <div className="flex items-center gap-3">
        <Avatar name={member.name} seed={member.slackUserId} src={member.avatarUrl} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="truncate font-normal">{member.name}</span>
            {member.isYou && <Chip>You</Chip>}
          </span>
          <span className="text-muted text-sm">Joined {shortDate(member.joinedAt)}</span>
        </div>
        {canChangeRole && onRoleChange ? (
          <RoleSelect
            name={member.name}
            value={member.role}
            onChange={onRoleChange}
            pending={pending}
            onlyOwner={onlyOwner}
            aria-describedby={error ? errorId : undefined}
          />
        ) : (
          <Chip variant={member.role === "owner" ? "tint" : "quiet"}>{roleLabel[member.role]}</Chip>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="ps-12 text-danger-ink text-sm">
          {error}
        </p>
      )}
    </PlateRow>
  );
}

export { MemberRow };
