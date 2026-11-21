import type { OwnGiven } from "@holler/core";
import type { ComponentProps } from "react";
import { Chip } from "@/components/ui/chip";
import { Plate, PlateRow } from "@/components/ui/plate";
import { cn } from "@/lib/cn";

interface Props extends ComponentProps<typeof Plate> {
  given: OwnGiven[];
}

function Given({ answer }: { answer: OwnGiven }) {
  if (answer.picks.length === 0) return <p className="text-muted">No answer</p>;
  if (answer.type === "text") {
    return (
      <div className="grid gap-2">
        {answer.picks.map((text) => (
          <p key={text} className="whitespace-pre-line text-pretty text-ink-2">
            {text}
          </p>
        ))}
      </div>
    );
  }
  if (answer.type === "number") {
    return <p className="tabular font-normal text-lg">{answer.picks.join(", ")}</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {answer.picks.map((pick) => (
        <li key={pick}>
          <Chip variant="tint" className="h-7 px-3 text-sm">
            {pick}
          </Chip>
        </li>
      ))}
    </ul>
  );
}

function GivenAnswers({ given, className, ...props }: Props) {
  return (
    <Plate data-slot="given-answers" className={cn(className)} {...props}>
      <dl>
        {given.map((answer) => (
          <PlateRow key={answer.questionId} className="grid gap-2.5 px-5 py-4">
            <dt className="text-pretty font-normal text-base">{answer.prompt}</dt>
            <dd className="grid gap-2.5">
              <Given answer={answer} />
              {answer.note && (
                <p className="text-pretty text-sm text-ink-2">
                  <span className="text-muted">Your note: </span>
                  {answer.note}
                </p>
              )}
            </dd>
          </PlateRow>
        ))}
      </dl>
    </Plate>
  );
}

export { GivenAnswers };
