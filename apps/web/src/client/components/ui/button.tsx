import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Three variants and four sizes, nothing else. One `primary` per screen: the main action, plum by
 * day and soft pink at night. `secondary` for every other action; `ghost` only for a way out, such
 * as Cancel. The `icon` sizes are square and need an `aria-label`.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "icon-sm" | "icon";

interface Props extends useRender.ComponentProps<"button"> {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  /** Shows a spinner, keeps the width, and swallows every further press, mouse or keyboard. */
  pending?: boolean | undefined;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary font-medium text-on-primary hoverable:hover:bg-primary-hover",
  secondary: "bg-plate text-ink edge-2 hoverable:hover:edge-3 active:bg-well",
  ghost: "text-ink-2 hoverable:hover:bg-hover hoverable:hover:text-ink",
};

// Each size keeps a 44 px hit area on touch screens through an invisible ::before.
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 rounded-sm px-3 text-sm [&_svg]:size-4 pointer-coarse:before:absolute pointer-coarse:before:-inset-y-1.5 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']",
  md: "h-10 rounded-control px-4 text-base [&_svg]:size-[18px] pointer-coarse:before:absolute pointer-coarse:before:-inset-y-0.5 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']",
  "icon-sm":
    "size-8 rounded-sm [&_svg]:size-4 pointer-coarse:before:absolute pointer-coarse:before:-inset-1.5 pointer-coarse:before:content-['']",
  icon: "size-10 rounded-control [&_svg]:size-[18px] pointer-coarse:before:absolute pointer-coarse:before:-inset-0.5 pointer-coarse:before:content-['']",
};

/** The class string, for the rare element that cannot take `render`. Prefer `render`. */
export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md") {
  return cn(
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap transition-[background-color,box-shadow,scale] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" ? "" : "font-normal",
    variants[variant],
    sizes[size],
  );
}

/**
 * A link that looks like a button passes itself as `render`: `<Button render={<Link to="/new" />}>`.
 * While `pending`, the button stays focusable and announced, and no press reaches `onClick`.
 */
export function Button({
  variant = "secondary",
  size = "md",
  pending = false,
  className,
  children,
  onClick,
  render,
  ref,
  ...rest
}: Props) {
  return useRender({
    defaultTagName: "button",
    render,
    ref,
    props: mergeProps<"button">(
      {
        type: render ? undefined : "button",
        "data-slot": "button",
        className: cn(buttonClasses(variant, size), pending && "cursor-progress", className),
        "aria-busy": pending || undefined,
        "aria-disabled": pending || undefined,
        onClick: (event) => {
          if (pending) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        },
        children: (
          <>
            <span className={cn("inline-flex items-center gap-2", pending && "invisible")}>
              {children}
            </span>
            {pending && (
              <Loader2 aria-hidden className="absolute size-4 animate-spin" strokeWidth={2} />
            )}
          </>
        ),
      } as useRender.ElementProps<"button">,
      rest,
    ),
  });
}
