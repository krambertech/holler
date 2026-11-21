import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: { box: "bg-well", icon: "text-ink-2" },
  live: { box: "bg-tint", icon: "text-tint-ink" },
  warning: { box: "bg-waiting", icon: "text-waiting-ink" },
  danger: { box: "bg-danger", icon: "text-danger-ink" },
} as const;

interface Props extends Omit<ComponentProps<"div">, "title"> {
  tone?: keyof typeof tones | undefined;
  /** An icon that says what kind of message this is, 18 px. */
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode | undefined;
  /** One thing to do about it, at most. */
  action?: ReactNode | undefined;
}

/**
 * A short message inside a screen: a title, at most a line more, an icon that says what kind, and one
 * action when there is something to do. A warning sits above the controls it limits.
 */
function Notice({
  tone = "neutral",
  icon,
  title,
  description,
  action,
  className,
  ...props
}: Props) {
  const t = tones[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      data-slot="notice"
      className={cn("flex flex-wrap items-start gap-x-3 gap-y-3 rounded-md p-4", t.box, className)}
      {...props}
    >
      <span aria-hidden className={cn("mt-[2px] shrink-0 [&_svg]:size-[18px]", t.icon)}>
        {icon}
      </span>
      <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
        <p className="text-pretty font-normal text-ink">{title}</p>
        {description && <p className="text-pretty text-ink-2 text-sm">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export { Notice };
