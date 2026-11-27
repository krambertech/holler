import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Check, X } from "lucide-react";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { type ControlProps, labelOf, pickOne } from "./answer-control";

const tileClassName = cn(
  "relative flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-control bg-plate px-3 py-2 text-center text-base text-ink leading-snug tabular edge-2",
  "transition-[background-color,box-shadow,color,scale] duration-150 ease-(--ease-out)",
  "hoverable:hover:not-data-checked:edge-3 active:scale-[0.97] motion-reduce:active:scale-100",
  "data-checked:bg-primary data-checked:text-on-primary data-checked:shadow-none",
  "focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2",
);

const phoneRow = 6;

function scaleColumns(count: number): CSSProperties {
  const phone = count <= phoneRow ? count : Math.ceil(count / 2);
  return {
    "--scale-phone": `repeat(${phone}, minmax(0, 1fr))`,
    "--scale-columns": `repeat(${count}, minmax(0, 1fr))`,
  } as CSSProperties;
}

function NumberScale({ question, value, onValueChange, legendId }: ControlProps) {
  return (
    <div className="flex flex-col gap-2">
      <RadioGroupPrimitive<string | null>
        aria-labelledby={legendId}
        value={value.optionIds[0] ?? null}
        onValueChange={(next) => onValueChange(pickOne(value, next))}
        className="grid grid-cols-(--scale-phone) gap-2 sm:grid-cols-(--scale-columns)"
        style={scaleColumns(question.options.length)}
      >
        {question.options.map((option, index) => (
          <RadioPrimitive.Root
            key={option.id}
            value={option.id}
            aria-label={labelOf(question, index)}
            className={tileClassName}
          >
            {option.label}
          </RadioPrimitive.Root>
        ))}
      </RadioGroupPrimitive>
      {(question.lowLabel || question.highLabel) && (
        <div aria-hidden="true" className="flex justify-between gap-4 text-muted text-sm">
          <span>{question.lowLabel}</span>
          <span className="text-end">{question.highLabel}</span>
        </div>
      )}
    </div>
  );
}

function useFitsOneRow() {
  const box = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(false);
  useLayoutEffect(() => {
    const outer = box.current;
    const inner = ruler.current;
    if (!outer || !inner) return;
    const measure = () => setFits(inner.scrollWidth <= outer.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => observer.disconnect();
  }, []);
  return { box, ruler, fits };
}

function WordScale({ question, value, onValueChange, legendId }: ControlProps) {
  const { box, ruler, fits } = useFitsOneRow();
  return (
    <div ref={box} className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-0 h-0 overflow-hidden"
      >
        <div ref={ruler} className="flex w-max gap-2">
          {question.options.map((option) => (
            <span key={option.id} className={cn(tileClassName, "whitespace-nowrap px-4")}>
              {option.label}
            </span>
          ))}
        </div>
      </div>
      <RadioGroupPrimitive<string | null>
        aria-labelledby={legendId}
        value={value.optionIds[0] ?? null}
        onValueChange={(next) => onValueChange(pickOne(value, next))}
        data-fits={fits || undefined}
        className="flex flex-col gap-2 data-fits:flex-row"
      >
        {question.options.map((option, index) => (
          <RadioPrimitive.Root
            key={option.id}
            value={option.id}
            className={cn(
              tileClassName,
              "text-balance in-data-fits:flex-auto in-data-fits:whitespace-nowrap in-data-fits:px-4",
            )}
          >
            {labelOf(question, index)}
          </RadioPrimitive.Root>
        ))}
      </RadioGroupPrimitive>
    </div>
  );
}

function YesNo({ question, value, onValueChange, legendId }: ControlProps) {
  return (
    <RadioGroupPrimitive<string | null>
      aria-labelledby={legendId}
      value={value.optionIds[0] ?? null}
      onValueChange={(next) => onValueChange(pickOne(value, next))}
      className="grid grid-cols-2 gap-2"
    >
      {question.options.map((option, index) => (
        <RadioPrimitive.Root
          key={option.id}
          value={option.id}
          className={cn(tileClassName, "[&_svg]:size-[18px]")}
        >
          {index === 0 ? <Check aria-hidden strokeWidth={2} /> : <X aria-hidden strokeWidth={2} />}
          {option.label}
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}

export { NumberScale, WordScale, YesNo };
