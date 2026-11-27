import { anonymousThreshold, type RoundOut, type RoundsOut } from "@holler/core";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Pencil, Repeat } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { count, momentLabel, shortDate } from "@/lib/format";

interface Props extends ComponentProps<"section"> {
  rounds: RoundsOut;
  currentId: string;
  canEdit?: boolean | undefined;
  now?: Date | undefined;
}

function HollerRounds({ rounds, currentId, canEdit = false, now, className, ...props }: Props) {
  const scored = rounds.rounds.find((round) => round.scores.length > 0)?.scores[0];
  const next = rounds.rounds.find((round) => round.status === "scheduled");
  return (
    <section
      aria-labelledby="rounds-heading"
      data-slot="holler-rounds"
      className={className}
      {...props}
    >
      <Plate>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-sm bg-well text-ink-2"
          >
            <Repeat className="size-4" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1 basis-60">
            <h2 id="rounds-heading" className="text-lg">
              Rounds
            </h2>
            <p className="mt-0.5 max-w-[60ch] text-ink-2 text-sm">
              {repeatLine(rounds.repeat)}
              {scored && ` Each bar is the average for “${scored.prompt}”.`}
            </p>
          </div>
          {canEdit && next && (
            <Button size="sm" render={<Link to="/hollers/$id" params={{ id: next.id }} />}>
              <Pencil aria-hidden />
              Edit next round
            </Button>
          )}
        </div>
        <ol>
          {rounds.rounds.map((round) => (
            <li key={round.id} className="border-divider border-t">
              <RoundRow round={round} current={round.id === currentId} now={now} />
            </li>
          ))}
        </ol>
      </Plate>
    </section>
  );
}

function repeatLine(repeat: RoundsOut["repeat"]): string {
  if (repeat === "week") return "A new round goes out every week.";
  if (repeat === "fortnight") return "A new round goes out every fortnight.";
  return "This pulse no longer repeats.";
}

function RoundRow({
  round,
  current,
  now,
}: {
  round: RoundOut;
  current: boolean;
  now?: Date | undefined;
}) {
  const body = (
    <>
      <span className="flex w-28 shrink-0 flex-col">
        <span className="text-ink tabular">
          {round.sendAt ? shortDate(round.sendAt) : "No date"}
        </span>
        <span className="text-muted text-sm">{stateWord(round, current)}</span>
      </span>
      <span className="order-last flex min-w-0 basis-full flex-col gap-1.5 sm:order-none sm:basis-auto sm:flex-1">
        <RoundMeasure round={round} now={now} current={current} />
      </span>
      {round.status !== "scheduled" && (
        <span className="ms-auto w-32 shrink-0 text-end text-ink-2 text-sm tabular">
          {count(round.responseCount)} of {count(round.recipientCount)} answered
        </span>
      )}
      <ChevronRight
        aria-hidden
        className={cn(
          "size-4 shrink-0 text-muted rtl:rotate-180",
          round.status === "scheduled" && "ms-auto",
          current && "invisible",
        )}
        strokeWidth={2}
      />
    </>
  );
  const row = "flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3";
  if (current) {
    return (
      <div aria-current="page" className={cn(row, "bg-tint")}>
        {body}
      </div>
    );
  }
  return (
    <Link
      to="/hollers/$id"
      params={{ id: round.id }}
      className={cn(row, "hoverable:hover:bg-tint focus-visible:bg-tint")}
    >
      {body}
    </Link>
  );
}

function stateWord(round: RoundOut, current: boolean): string {
  if (current) return "This round";
  if (round.status === "scheduled") return "Next round";
  if (round.status === "live") return "Live";
  return "Closed";
}

function RoundMeasure({
  round,
  now,
  current,
}: {
  round: RoundOut;
  now?: Date | undefined;
  current: boolean;
}): ReactNode {
  if (round.status === "scheduled") {
    return (
      <span className="text-ink-2 text-sm">
        {round.sendAt ? `Goes out ${momentLabel(round.sendAt, now)}` : "Not scheduled yet"}
      </span>
    );
  }
  if (round.gated) {
    return <span className="text-ink-2 text-sm">Results open at {anonymousThreshold} answers</span>;
  }
  const [score] = round.scores;
  if (!score || score.average === null) {
    return <span className="text-ink-2 text-sm">No answers yet</span>;
  }
  return (
    <>
      <span className="text-sm tabular">
        Average {count(score.average)} of {count(score.top)}
      </span>
      <ProgressBar
        value={score.top === 0 ? 0 : score.average / score.top}
        className={cn(current && "bg-plate")}
      />
    </>
  );
}

export { HollerRounds };
