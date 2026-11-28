import { type Mode, modeDescriptions, modeLabels, modes, questionLimits } from "@holler/core";
import { Check, ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { modeIcons } from "@/components/mode-glyph";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

const newLabel: Record<Mode, string> = {
  pulse: "New pulse",
  survey: "New survey",
  chase: "New chase",
};

interface Props extends Omit<ComponentProps<"button">, "onChange"> {
  mode: Mode;
  onChange: (mode: Mode) => void;
  questionCount: number;
}

function ModePicker({ mode, onChange, questionCount, className, ...props }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        {...props}
        data-slot="mode-picker"
        className={cn(
          "relative inline-flex h-9 min-w-0 items-center gap-1.5 rounded-control px-2 text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus hoverable:hover:bg-hover data-popup-open:bg-hover pointer-coarse:before:absolute pointer-coarse:before:-inset-y-1 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']",
          className,
        )}
      >
        <span className="truncate">{newLabel[mode]}</span>
        <ChevronDown aria-hidden size={16} strokeWidth={2} className="shrink-0 text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label="What you are sending" align="start" className="w-[24rem]">
        <DropdownMenuRadioGroup value={mode} onValueChange={(next) => onChange(next as Mode)}>
          {modes.map((option) => {
            const OptionIcon = modeIcons[option];
            const tooMany = questionCount > questionLimits[option].max && option === "pulse";
            return (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                disabled={tooMany}
                checkmark={false}
                className="py-2.5"
              >
                <span className="grid min-w-0 flex-1 grid-cols-[1rem_minmax(0,1fr)_1rem] items-center gap-x-3 gap-y-0.5">
                  <OptionIcon aria-hidden size={16} strokeWidth={2} className="text-muted" />
                  <span className="font-normal text-ink">{modeLabels[option]}</span>
                  {option === mode ? (
                    <Check aria-hidden size={16} strokeWidth={2.5} className="text-ink" />
                  ) : (
                    <span aria-hidden />
                  )}
                  <span className="col-start-2 whitespace-normal text-muted text-sm">
                    {tooMany
                      ? "A pulse has one or two questions. Remove some to switch."
                      : modeDescriptions[option]}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ModePicker };
