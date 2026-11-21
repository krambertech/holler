import type * as React from "react";
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { useMergedRefs } from "@/lib/use-merged-refs";
import { useField, useFieldControl } from "./field";
import { controlBase, controlText } from "./input";

const growsNatively = typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");

// Where `field-sizing` is missing, the height is set from the content on every change instead.
function fitContent(el: HTMLTextAreaElement | null) {
  if (!el || growsNatively) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** Grows with its content up to half the screen, then scrolls. */
function Textarea({
  className,
  disabled,
  ref,
  onInput,
  ...props
}: React.ComponentProps<"textarea">) {
  const field = useField();
  const control = useFieldControl(props);
  const own = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useMergedRefs(own, ref);
  // A controlled value can change without an input event, from a reset or an autofill.
  const value = props.value;
  useLayoutEffect(() => {
    if (value !== undefined) fitContent(own.current);
  }, [value]);
  return (
    <textarea
      ref={setRef}
      data-slot="textarea"
      disabled={disabled || field?.disabled}
      className={cn(
        controlBase,
        controlText,
        "max-h-[50dvh] min-h-24 resize-none px-3.5 py-2.5 leading-relaxed [field-sizing:content]",
        className,
      )}
      onInput={(e) => {
        fitContent(e.currentTarget);
        onInput?.(e);
      }}
      {...props}
      {...control}
    />
  );
}

export { Textarea };
