import type { MemberRole } from "@holler/core";
import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

interface Props extends Omit<ComponentProps<"select">, "value" | "onChange"> {
  /** Whose role this is, for the label a screen reader hears. */
  name: string;
  value: MemberRole;
  onChange: (role: MemberRole) => void;
  pending?: boolean | undefined;
  /** The workspace's only owner: Sender is not offered, because a workspace keeps one owner. */
  onlyOwner?: boolean | undefined;
}

/**
 * Owner or sender, for an owner looking at Settings → Members. A native select, so the keyboard,
 * screen readers and phones all get the control they already know.
 */
function RoleSelect({
  name,
  value,
  onChange,
  pending = false,
  onlyOwner = false,
  className,
  ...props
}: Props) {
  return (
    <span data-slot="role-select" className="relative inline-flex">
      <select
        aria-label={`Role for ${name}`}
        aria-busy={pending || undefined}
        disabled={pending}
        value={value}
        onChange={(event) => onChange(event.target.value as MemberRole)}
        className={cn(
          "h-8 appearance-none rounded-sm bg-plate ps-3 pe-8 text-ink text-sm edge-2 transition-[box-shadow] hoverable:hover:edge-3",
          "pointer-coarse:h-11",
          pending && "cursor-progress text-muted",
          className,
        )}
        {...props}
      >
        <option value="owner">Owner</option>
        <option value="sender" disabled={onlyOwner}>
          Sender
        </option>
      </select>
      <ChevronDown
        aria-hidden
        strokeWidth={2}
        className="pointer-events-none absolute end-2 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </span>
  );
}

export { RoleSelect };
