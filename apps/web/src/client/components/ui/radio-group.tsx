import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { CHOICE_FADE, CHOICE_LEAVE, CHOICE_POP } from "@holler/design";
import { motion } from "motion/react";
import { focusChosen, fromItem } from "@/lib/choice-focus";
import { cn } from "@/lib/cn";
import { useReduceMotion } from "@/lib/use-reduce-motion";
import { FieldItems, useField, useFieldControl } from "./field";

const ITEM = '[role="radio"]';

interface RadioGroupProps<Value> extends Omit<RadioGroupPrimitive.Props<Value>, "className"> {
  className?: string | undefined;
}

interface RadioGroupItemProps extends Omit<RadioPrimitive.Root.Props, "className"> {
  className?: string | undefined;
}

/** One of a few visible choices. The chosen one fills plum with a white dot, like a ticked Checkbox. */
function RadioGroup<Value>({
  className,
  disabled,
  children,
  onFocus,
  onKeyDown,
  onKeyDownCapture,
  ...props
}: RadioGroupProps<Value>) {
  const field = useField();
  const control = useFieldControl(props);
  return (
    <RadioGroupPrimitive<Value>
      data-slot="radio-group"
      disabled={disabled || field?.disabled}
      className={cn("group/radio-group grid w-full gap-2", className)}
      onFocus={(event) => {
        focusChosen(event, ITEM, `${ITEM}[aria-checked="true"]`);
        onFocus?.(event);
      }}
      // Arrow keys in a control nested in a row, such as a number or a link's buttons, stay with that control.
      onKeyDownCapture={(event) => {
        if (!fromItem(event, ITEM)) event.preventBaseUIHandler();
        onKeyDownCapture?.(event);
      }}
      onKeyDown={(event) => {
        if (!fromItem(event, ITEM)) event.preventBaseUIHandler();
        onKeyDown?.(event);
      }}
      {...props}
      {...control}
    >
      <FieldItems>{children}</FieldItems>
    </RadioGroupPrimitive>
  );
}

function RadioGroupItem({ className, disabled, ...props }: RadioGroupItemProps) {
  const field = useField();
  const control = useFieldControl(props);
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      disabled={disabled || field?.disabled}
      className={cn(
        "group/radio relative inline-grid size-[18px] shrink-0 cursor-pointer place-items-center rounded-full",
        "edge-2 bg-plate transition-[background-color,box-shadow,scale] duration-150 ease-(--ease-out) data-checked:bg-primary data-checked:shadow-none",
        "active:scale-95 motion-reduce:active:scale-100",
        // Carries the touch target to 44 px without moving anything around it.
        "after:absolute after:-inset-[13px] after:content-['']",
        "aria-invalid:edge-danger group-aria-invalid/radio-group:edge-danger",
        "data-disabled:cursor-not-allowed data-disabled:opacity-45 data-disabled:active:scale-100",
        className,
      )}
      {...props}
      {...control}
    >
      <RadioPrimitive.Indicator
        keepMounted
        data-slot="radio-group-indicator"
        className="grid place-items-center"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            <RadioDot checked={state.checked} />
          </span>
        )}
      />
    </RadioPrimitive.Root>
  );
}

function RadioDot({ checked }: { checked: boolean }) {
  const reduce = useReduceMotion();
  return (
    <motion.span
      aria-hidden="true"
      initial={false}
      animate={checked ? { scale: 1, opacity: 1 } : { scale: reduce ? 1 : 0.3, opacity: 0 }}
      transition={
        reduce
          ? CHOICE_FADE
          : checked
            ? { scale: CHOICE_POP, opacity: { duration: 0.08 } }
            : CHOICE_LEAVE
      }
      className="block size-2 rounded-full bg-on-primary"
    />
  );
}

export { RadioGroup, RadioGroupItem };
