import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "@/lib/cn";

interface SeparatorProps extends Omit<SeparatorPrimitive.Props, "className"> {
  className?: string | undefined;
}

function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-edge data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
