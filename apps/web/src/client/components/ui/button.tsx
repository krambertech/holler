import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One plum button on a screen: `primary`. Everything else is `secondary`, white with a hairline.
 * `icon` is a 40 px square for an icon-only action and needs an aria-label.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "icon";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  /** Shows a spinner, keeps the label for width, and blocks a second press. */
  pending?: boolean;
  icon?: ReactNode;
}

export const buttonClasses = (variant: ButtonVariant = "secondary", size: "md" | "sm" = "md") =>
  cn(
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    size === "md" ? "h-10 text-base" : "h-8 rounded-sm text-sm",
    variant === "primary" && "bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover",
    variant === "secondary" &&
      "bg-plate px-4 font-normal text-ink shadow-[0_0_0_1px_var(--edge-2)] hover:bg-well",
    variant === "ghost" && "px-3 font-normal text-ink-2 hover:bg-hover hover:text-ink",
    variant === "icon" &&
      cn(
        "bg-plate text-ink shadow-[0_0_0_1px_var(--edge-2)] hover:bg-well",
        size === "md" ? "w-10" : "w-8",
      ),
  );

export function Button({
  variant = "secondary",
  size = "md",
  pending = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={cn(buttonClasses(variant, size), pending && "pointer-events-none", className)}
      disabled={disabled}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      onClickCapture={pending ? (event) => event.preventDefault() : undefined}
      {...rest}
    >
      <span className={cn("inline-flex items-center gap-2", pending && "invisible")}>
        {icon}
        {children}
      </span>
      {pending && <Loader2 aria-hidden className="absolute size-4 animate-spin" strokeWidth={2} />}
    </button>
  );
}
