import type { ComponentProps, ReactNode } from "react";
import { Plate } from "@/components/ui/plate";
import { cn } from "@/lib/cn";

interface Props extends Omit<ComponentProps<"div">, "title"> {
  title: string;
  description?: ReactNode | undefined;
}

function RespondState({ title, description, className, children, ...props }: Props) {
  return (
    <Plate
      data-slot="respond-state"
      className={cn("flex flex-col items-start gap-4 px-6 py-7 sm:px-8", className)}
      {...props}
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-balance text-3xl tracking-title">{title}</h1>
        {description && <div className="text-pretty text-ink-2">{description}</div>}
      </div>
      {children}
    </Plate>
  );
}

export { RespondState };
