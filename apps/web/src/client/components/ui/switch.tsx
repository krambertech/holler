import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { CHOICE_SLIDE, INSTANT } from "@holler/design";
import { motion } from "motion/react";
import * as React from "react";
import { cn } from "@/lib/cn";
import { useReduceMotion } from "@/lib/use-reduce-motion";
import { useField, useFieldControl } from "./field";

/** How far a held thumb stretches toward the side it is about to leave for. */
const STRETCH = 5;

const sizes = {
  md: { track: "h-[26px] w-[44px]", thumb: 20, travel: 18 },
  /** For a setting that sits beside other controls, such as Required on a question. */
  sm: { track: "h-5 w-[34px]", thumb: 14, travel: 14 },
} as const;

interface SwitchProps extends Omit<SwitchPrimitive.Root.Props, "className"> {
  size?: keyof typeof sizes | undefined;
  className?: string | undefined;
}

/** On or off, taking effect the moment it changes. */
function Switch({ size = "md", className, disabled, onPointerDown, ...props }: SwitchProps) {
  const dims = sizes[size];
  const field = useField();
  const control = useFieldControl(props);
  const [held, setHeld] = React.useState(false);

  React.useEffect(() => {
    if (!held) return;
    const release = () => setHeld(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [held]);

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      disabled={disabled || field?.disabled}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (event.button === 0) setHeld(true);
      }}
      className={cn(
        "group/switch relative inline-flex shrink-0 cursor-pointer rounded-full",
        dims.track,
        "edge-2 bg-well transition-[background-color,box-shadow] duration-200 ease-(--ease-out) data-checked:bg-primary data-checked:shadow-none",
        // Carries the touch target to 44 px tall without moving anything around it.
        size === "md"
          ? "after:absolute after:-inset-y-[9px] after:inset-x-0 after:content-['']"
          : "after:absolute after:-inset-y-3 after:-inset-x-1 after:content-['']",
        "aria-invalid:edge-danger data-disabled:cursor-not-allowed data-disabled:opacity-45",
        className,
      )}
      {...props}
      {...control}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        // Laid out left to right and mirrored in a right-to-left page, so the travel needs no sign.
        className="pointer-events-none absolute start-[3px] top-[3px] [direction:ltr] rtl:-scale-x-100"
        style={{ height: dims.thumb, width: dims.thumb + dims.travel }}
        render={(thumbProps, state) => (
          <span {...thumbProps}>
            <SwitchThumb
              checked={state.checked}
              held={held && !state.disabled}
              size={dims.thumb}
              travel={dims.travel}
            />
          </span>
        )}
      />
    </SwitchPrimitive.Root>
  );
}

function SwitchThumb({
  checked,
  held,
  size,
  travel,
}: {
  checked: boolean;
  held: boolean;
  size: number;
  travel: number;
}) {
  const reduce = useReduceMotion();
  const stretch = held && !reduce ? STRETCH : 0;
  const x = checked ? travel - stretch : 0;
  return (
    <motion.span
      initial={false}
      // Held, the thumb widens like a fingertip pressed flat; let go, it springs across and settles.
      animate={{ x, width: size + stretch }}
      transition={reduce ? INSTANT : CHOICE_SLIDE}
      className={cn(
        "block h-full rounded-full transition-[background-color,box-shadow] duration-200",
        checked ? "bg-on-primary" : "edge-2 bg-plate",
      )}
    />
  );
}

export { Switch };
