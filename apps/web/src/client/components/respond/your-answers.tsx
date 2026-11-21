import type { RespondGiven } from "@holler/core";
import type { ComponentProps } from "react";
import { PlateRow } from "@/components/ui/plate";
import { cn } from "@/lib/cn";

interface Props extends ComponentProps<"div"> {
  given: readonly RespondGiven[];
}

const list = (picks: readonly string[]) => new Intl.ListFormat(undefined).format(picks);

function YourAnswers({ given, className, ...props }: Props) {
  return (
    <PlateRow
      data-slot="your-answers"
      className={cn("flex flex-col gap-5 px-6 py-7 sm:px-10", className)}
      {...props}
    >
      <h2 className="text-lg">Your answers</h2>
      <dl className="flex flex-col gap-5">
        {given.map((answer) => (
          <div key={answer.questionId} className="flex flex-col gap-1">
            <dt className="text-pretty text-muted text-sm">{answer.prompt}</dt>
            <dd className="whitespace-pre-line text-pretty text-ink">
              {answer.picks.length > 0 ? (
                list(answer.picks)
              ) : (
                <span className="text-muted">No answer</span>
              )}
            </dd>
            {answer.note && (
              <dd className="mt-1 whitespace-pre-line border-divider border-s-2 ps-3 text-pretty text-ink-2">
                {answer.note}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </PlateRow>
  );
}

export { YourAnswers };
