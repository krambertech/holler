import { ChevronDown, CircleAlert } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

export interface SendSplitOption {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

interface SendSplitProps extends Omit<ComponentProps<typeof Button>, "variant"> {
  options: SendSplitOption[];
  "aria-label"?: string | undefined;
  children: ReactNode;
}

function SendSplit({ options, children, className, ...props }: SendSplitProps) {
  return (
    <div data-slot="send-split" className="flex">
      <Button variant="primary" className={cn("grow rounded-e-none", className)} {...props}>
        {children}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="primary"
              size="icon"
              aria-label="More ways to send"
              className="shrink-0 rounded-s-none border-on-primary/25 border-s"
            />
          }
        >
          <ChevronDown aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label="More ways to send" align="end" className="min-w-56">
          {options.map((option) => (
            <DropdownMenuItem key={option.label} onClick={option.onSelect}>
              {option.icon}
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface SendBarProps extends ComponentProps<"div"> {
  children: ReactNode;
  description?: ReactNode | undefined;
  tone?: "neutral" | "danger" | undefined;
  secondary?: ReactNode | undefined;
  action: ReactNode;
}

function SendBar({
  children,
  description,
  tone = "neutral",
  secondary,
  action,
  className,
  ...props
}: SendBarProps) {
  const end = useRef<HTMLDivElement>(null);
  const [resting, setResting] = useState(true);

  useEffect(() => {
    const el = end.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) =>
      setResting(Boolean(entry?.isIntersecting)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        data-slot="send-bar"
        data-resting={resting || undefined}
        className={cn(
          "sticky bottom-0 z-(--z-sticky) mt-auto pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-2.5 py-2.5 ps-5 pe-2.5 transition-[background-color,box-shadow,border-radius] duration-200 ease-(--ease-out) max-sm:px-4",
            resting ? "rounded-none" : "floating rounded-plate",
          )}
        >
          <div className="grid min-w-0 flex-1 basis-44 leading-snug" aria-live="polite">
            <span
              className={cn(
                "flex min-w-0 items-start gap-1.5 text-pretty font-normal tabular",
                tone === "danger" ? "text-danger-ink" : "text-ink",
              )}
            >
              {tone === "danger" && <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
              <span className="min-w-0">{children}</span>
            </span>
            {description && (
              <span className="truncate text-muted text-sm tabular">{description}</span>
            )}
          </div>
          <div className="flex grow items-center justify-end gap-2 sm:grow-0">
            {secondary}
            <div className="flex max-sm:grow max-sm:*:grow">{action}</div>
          </div>
        </div>
      </div>
      <div ref={end} aria-hidden className="h-px" />
    </>
  );
}

export { SendBar, SendSplit };
