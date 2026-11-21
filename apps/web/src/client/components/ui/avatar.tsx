import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const pastels = [
  "bg-avatar-1 text-avatar-1-ink",
  "bg-avatar-2 text-avatar-2-ink",
  "bg-avatar-3 text-avatar-3-ink",
  "bg-avatar-4 text-avatar-4-ink",
  "bg-avatar-5 text-avatar-5-ink",
  "bg-avatar-6 text-avatar-6-ink",
];

function pastelFor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return pastels[hash % pastels.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0] ?? "?"];
  return letters
    .map((p) => [...(p ?? "?")][0]?.toLocaleUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

export type AvatarSize = "sm" | "md" | "lg" | "xl";

const sizes: Record<AvatarSize, string> = {
  sm: "size-5 text-[8px]",
  md: "size-[26px] text-[10px]",
  lg: "size-9 text-sm",
  xl: "size-12 text-lg",
};

/** How far each avatar tucks under the one before it in a stack, per size. */
const overlap: Record<AvatarSize, string> = {
  sm: "-ms-1",
  md: "-ms-[5px]",
  lg: "-ms-2",
  xl: "-ms-2.5",
};

interface AvatarProps extends ComponentProps<"span"> {
  name: string;
  /** The Slack id, so a person keeps the same pastel everywhere. */
  seed: string;
  src?: string | null | undefined;
  /** Someone still waiting: greyed, so answered people stand out in a stack. */
  waiting?: boolean | undefined;
  size?: AvatarSize | undefined;
}

/** A person. Slack's photo when there is one, initials on a pastel otherwise. Decorative: the name is said elsewhere. */
function Avatar({
  name,
  seed,
  src,
  waiting = false,
  size = "md",
  className,
  ...props
}: AvatarProps) {
  return (
    <span
      aria-hidden
      data-slot="avatar"
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full font-normal",
        sizes[size],
        waiting ? "bg-track text-faint" : pastelFor(seed),
        className,
      )}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className={cn("size-full object-cover", waiting && "opacity-45 grayscale")}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

interface StackPerson {
  slackUserId: string;
  name: string;
  avatarUrl: string | null;
  answered: boolean;
}

interface AvatarStackProps extends ComponentProps<"span"> {
  people: StackPerson[];
  /** Everyone, including those not drawn, for the "+N". */
  total: number;
  /** Says what the stack means: "12 people, 7 answered". The stack is one image to screen readers. */
  "aria-label": string;
  size?: AvatarSize | undefined;
}

/** Overlapping avatars with a "+N" for the rest. Answered first, then waiting. */
function AvatarStack({ people, total, size = "md", className, ...props }: AvatarStackProps) {
  const rest = total - people.length;
  const ring = "shadow-[0_0_0_2px_var(--plate)]";
  return (
    <span
      role="img"
      data-slot="avatar-stack"
      className={cn("flex items-center", className)}
      {...props}
    >
      {people.map((person, index) => (
        <Avatar
          key={person.slackUserId}
          name={person.name}
          seed={person.slackUserId}
          src={person.avatarUrl}
          waiting={!person.answered}
          size={size}
          className={cn(ring, index > 0 && overlap[size])}
        />
      ))}
      {rest > 0 && (
        <span
          aria-hidden
          className={cn(
            "grid place-items-center rounded-full bg-track text-muted tabular",
            sizes[size],
            overlap[size],
            ring,
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

export { Avatar, AvatarStack, initials };
