import type * as React from "react";
import { cn } from "@/lib/cn";
import { useField, useFieldControl } from "./field";

/** The box every form control shares. An invalid box keeps its red edge under hover, focus and an open list. */
export const controlBase =
  "w-full min-w-0 rounded-control bg-plate text-ink edge transition-[box-shadow,background-color] duration-150 " +
  "placeholder:text-muted hoverable:hover:not-aria-invalid:edge-2 focus-visible:not-aria-invalid:edge-2 " +
  "disabled:cursor-not-allowed disabled:bg-well disabled:text-muted aria-invalid:edge-danger";

/** Text size alone, for a control whose height follows its content: 16 px on touch, so iOS does not zoom on focus. */
export const controlText = "text-[1rem] md:hoverable:text-base";

/** The control height and text size: 44 px under a finger, 40 with a mouse. */
export const controlSize = `h-11 md:h-10 ${controlText}`;

const sizes = {
  sm: `h-[34px] ${controlText}`,
  md: controlSize,
};

interface InputProps extends Omit<React.ComponentProps<"input">, "size"> {
  size?: keyof typeof sizes | undefined;
}

// A plain input rather than Base UI's, which validates natively on Enter and would overrule the Field.
function Input({ className, disabled, size = "md", ...props }: InputProps) {
  const field = useField();
  const control = useFieldControl(props);
  return (
    <input
      data-slot="input"
      disabled={disabled || field?.disabled}
      className={cn(controlBase, sizes[size], "px-3.5", className)}
      {...props}
      {...control}
    />
  );
}

interface InputGroupProps extends React.ComponentProps<"div"> {
  /** Decoration at the start of the box, such as a search icon. The input's label names the box. */
  icon: React.ReactNode;
}

/** An `Input` with an icon inside its start edge. The icon lets the pointer through to the input. */
function InputGroup({ icon, className, children, ...props }: InputGroupProps) {
  return (
    <div
      data-slot="input-group"
      className={cn("relative w-full min-w-0 [&>[data-slot=input]]:ps-9", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted [&_svg]:size-4 [&_svg]:shrink-0"
      >
        {icon}
      </span>
      {children}
    </div>
  );
}

export { Input, InputGroup };
