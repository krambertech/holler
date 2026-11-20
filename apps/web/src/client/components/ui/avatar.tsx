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

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0] ?? "?"];
  return letters
    .map((p) => [...(p ?? "?")][0]?.toLocaleUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

interface AvatarProps {
  name: string;
  seed: string;
  src?: string | null;
  /** Someone still waiting: greyed, so answered people stand out in a stack. */
  waiting?: boolean;
  size?: number;
  className?: string;
}

/** A person. A photo when Slack has one, initials on a pastel otherwise. Decorative: the name is said elsewhere. */
export function Avatar({ name, seed, src, waiting = false, size = 26, className }: AvatarProps) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full font-medium",
        waiting ? "bg-track text-faint" : pastelFor(seed),
        className,
      )}
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

/** Overlapping avatars with a "+N" for the rest. The label says what the stack means. */
export function AvatarStack({
  people,
  total,
  label,
}: {
  people: { slackUserId: string; name: string; avatarUrl: string | null; answered: boolean }[];
  total: number;
  label: string;
}) {
  const rest = total - people.length;
  return (
    <span role="img" aria-label={label} className="flex items-center">
      {people.map((person) => (
        <Avatar
          key={person.slackUserId}
          name={person.name}
          seed={person.slackUserId}
          src={person.avatarUrl}
          waiting={!person.answered}
          className="-ms-[5px] shadow-[0_0_0_2px_var(--plate)] first:ms-0"
        />
      ))}
      {rest > 0 && (
        <span
          aria-hidden
          className="-ms-[5px] grid size-[26px] place-items-center rounded-full bg-track font-medium text-[10.5px] text-muted shadow-[0_0_0_2px_var(--plate)]"
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
