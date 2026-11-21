import type { MemberRole } from "@holler/core";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  /** Whose role this is, for the label a screen reader hears. */
  name: string;
  value: MemberRole;
  onChange: (role: MemberRole) => void;
  pending?: boolean;
  /** Describes the select, such as the error beside it. */
  describedBy?: string;
  /** The workspace's only owner: Sender is not offered, because a workspace keeps one owner. */
  onlyOwner?: boolean;
}

/**
 * Owner or sender, for an owner looking at Settings → Members. A native select, so the keyboard,
 * screen readers and phones all get the control they already know.
 */
export function RoleSelect({
  name,
  value,
  onChange,
  pending = false,
  describedBy,
  onlyOwner = false,
}: Props) {
  return (
    <span className="relative inline-flex">
      <select
        aria-label={`Role for ${name}`}
        aria-describedby={describedBy}
        aria-busy={pending || undefined}
        disabled={pending}
        value={value}
        onChange={(event) => onChange(event.target.value as MemberRole)}
        className={cn(
          "h-8 appearance-none rounded-sm bg-plate ps-3 pe-8 text-ink text-sm shadow-[0_0_0_1px_var(--edge-2)] transition-colors hover:bg-well",
          pending && "text-muted",
        )}
      >
        <option value="owner">Owner</option>
        <option value="sender" disabled={onlyOwner}>
          Sender
        </option>
      </select>
      <ChevronDown
        aria-hidden
        size={16}
        strokeWidth={2}
        className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-muted"
      />
    </span>
  );
}
