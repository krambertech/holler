import type { IllustrationName } from "@holler/design";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Illustration, type IllustrationTone } from "./illustration";

export type StateSize = "sm" | "md" | "lg";
export type StateVariant = "plate" | "dashed" | "bare";

const sizes: Record<
  StateSize,
  { box: string; art: string; title: string; description: string; action: string; footer: string }
> = {
  lg: {
    box: "flex flex-col items-center px-6 py-10 text-center",
    art: "mb-5",
    title: "text-balance text-xl",
    description: "mt-1.5 max-w-[44ch] text-pretty text-ink-2",
    action: "mt-6 justify-center",
    footer: "mt-5",
  },
  md: {
    box: "flex flex-col items-center px-5 py-8 text-center",
    art: "mb-3.5",
    title: "text-balance font-normal text-ink",
    description: "mt-1 max-w-[40ch] text-pretty text-muted text-sm",
    action: "mt-4 justify-center",
    footer: "mt-5",
  },
  sm: {
    box: "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 px-4 py-3.5 text-start @md:grid-cols-[auto_minmax(0,1fr)_auto]",
    art: "",
    title: "font-normal text-ink text-sm",
    description: "text-pretty text-muted text-sm",
    action: "col-start-2 @md:col-start-3 @md:row-start-1",
    footer: "col-start-2 @md:col-span-2",
  },
};

const variants: Record<StateVariant, (size: StateSize) => string> = {
  plate: (size) => cn("bg-plate edge", size === "sm" ? "rounded-md" : "rounded-plate"),
  dashed: (size) =>
    cn(
      "border-[1.5px] border-edge-2 border-dashed",
      size === "sm" ? "rounded-md" : "rounded-plate",
    ),
  bare: () => "",
};

interface Props extends Omit<ComponentProps<"section">, "title"> {
  illustration?: IllustrationName | undefined;
  tone?: IllustrationTone | undefined;
  title: ReactNode;
  description?: ReactNode | undefined;
  action?: ReactNode | undefined;
  footer?: ReactNode | undefined;
  size?: StateSize | undefined;
  variant?: StateVariant | undefined;
}

function StateLayout({
  illustration,
  tone,
  title,
  description,
  action,
  footer,
  size = "md",
  variant = "plate",
  className,
  ...props
}: Props) {
  const s = sizes[size];
  const Title = size === "lg" ? "h2" : size === "md" ? "h3" : "p";
  return (
    <section
      data-size={size}
      data-variant={variant}
      className={cn("@container", variants[variant](size), className)}
      {...props}
    >
      <div className={s.box}>
        {illustration && (
          <Illustration name={illustration} size={size} tone={tone} className={s.art} />
        )}
        <div className={cn(size === "sm" ? "grid min-w-0 gap-0.5" : "contents")}>
          <Title className={s.title}>{title}</Title>
          {description && <p className={s.description}>{description}</p>}
        </div>
        {action && <div className={cn("flex flex-wrap gap-2", s.action)}>{action}</div>}
        {footer && <div className={cn("text-muted text-xs", s.footer)}>{footer}</div>}
      </div>
    </section>
  );
}

function EmptyState(props: Omit<Props, "tone">) {
  return <StateLayout data-slot="empty-state" {...props} />;
}

export { EmptyState, StateLayout };
