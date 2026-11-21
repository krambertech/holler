import type { MemberRole, SettingsMember } from "@holler/core";
import { Avatar } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { PlateRow } from "@/components/ui/plate";
import { shortDate } from "@/lib/format";
import { RoleSelect } from "./role-select";

const roleLabel: Record<MemberRole, string> = { owner: "Owner", sender: "Sender" };

interface Props {
  member: SettingsMember;
  /** True when the person looking is an owner, who may change roles. */
  canChangeRole: boolean;
  onRoleChange?: (role: MemberRole) => void;
  pending?: boolean;
  error?: string | null;
  /** This member is the workspace's only owner. */
  onlyOwner?: boolean;
}

/** One member in Settings: who they are, when they joined, and their role. */
export function MemberRow({
  member,
  canChangeRole,
  onRoleChange,
  pending,
  error,
  onlyOwner = false,
}: Props) {
  const errorId = `role-error-${member.id}`;
  return (
    <PlateRow className="flex flex-col gap-2 px-5 py-3.5">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} seed={member.slackUserId} src={member.avatarUrl} size={34} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="truncate font-normal text-md">{member.name}</span>
            {member.isYou && <Chip>You</Chip>}
          </span>
          <span className="text-muted text-sm">Joined {shortDate(member.joinedAt)}</span>
        </div>
        {canChangeRole && onRoleChange ? (
          <RoleSelect
            name={member.name}
            value={member.role}
            onChange={onRoleChange}
            pending={pending ?? false}
            onlyOwner={onlyOwner}
            {...(error ? { describedBy: errorId } : {})}
          />
        ) : (
          <Chip tone={member.role === "owner" ? "tint" : "quiet"}>{roleLabel[member.role]}</Chip>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="ps-[46px] text-danger-ink text-sm">
          {error}
        </p>
      )}
    </PlateRow>
  );
}
