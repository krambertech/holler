import { initials } from "@/components/ui/avatar";

/** The Slack workspace's icon, or its initials on a tint tile when it has none. */
export function WorkspaceIcon({
  name,
  src,
  size = 44,
}: {
  name: string;
  src: string | null;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className="grid shrink-0 place-items-center overflow-hidden rounded-glyph bg-tint font-normal text-tint-ink"
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initials(name)}
    </span>
  );
}
