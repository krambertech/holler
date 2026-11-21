import type { ComponentProps } from "react";
import { initials } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";

type WorkspaceIconSize = "md" | "lg";

const sizes: Record<WorkspaceIconSize, string> = {
  md: "size-8 text-xs",
  lg: "size-11 text-base",
};

interface Props extends ComponentProps<"span"> {
  name: string;
  src: string | null;
  size?: WorkspaceIconSize | undefined;
}

/** The Slack workspace's icon, or its initials on a tint tile when it has none. Decoration only. */
function WorkspaceIcon({ name, src, size = "lg", className, ...props }: Props) {
  return (
    <span
      aria-hidden
      data-slot="workspace-icon"
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-glyph bg-tint font-normal text-tint-ink",
        sizes[size],
        className,
      )}
      {...props}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initials(name)}
    </span>
  );
}

export { WorkspaceIcon };
