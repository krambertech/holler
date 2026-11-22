import type { IllustrationName } from "@holler/design";
import type { ComponentProps, ReactNode } from "react";
import { StateLayout } from "./empty-state";
import { Button } from "./ui/button";

interface Props extends Omit<
  ComponentProps<typeof StateLayout>,
  "title" | "action" | "footer" | "illustration"
> {
  title: ReactNode;
  onRetry?: (() => void) | undefined;
  pending?: boolean | undefined;
  action?: ReactNode | undefined;
  reference?: string | undefined;
  illustration?: IllustrationName | null | undefined;
}

function ErrorState({
  title,
  description = "Check your connection and try again. If it keeps happening, it is on our side and we are on it.",
  onRetry,
  pending = false,
  action,
  reference,
  illustration = "error",
  tone,
  size = "md",
  ...props
}: Props) {
  return (
    <StateLayout
      role="alert"
      data-slot="error-state"
      illustration={illustration ?? undefined}
      tone={tone}
      size={size}
      title={title}
      description={description}
      action={
        onRetry || action ? (
          <>
            {onRetry && (
              <Button size={size === "lg" ? "md" : "sm"} onClick={onRetry} pending={pending}>
                Try again
              </Button>
            )}
            {action}
          </>
        ) : undefined
      }
      footer={reference ? <span className="font-mono">Reference {reference}</span> : undefined}
      {...props}
    />
  );
}

export { ErrorState };
