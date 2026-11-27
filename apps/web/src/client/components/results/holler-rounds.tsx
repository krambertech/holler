import {
  anonymousThreshold,
  type RepeatEvery,
  type RoundOut,
  type RoundsOut,
  repeatEvery,
} from "@holler/core";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Pencil, Repeat, RepeatOff } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plate } from "@/components/ui/plate";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { count, momentLabel, shortDate } from "@/lib/format";

interface Props extends ComponentProps<"section"> {
  rounds: RoundsOut;
  currentId: string;
  canEdit?: boolean | undefined;
  now?: Date | undefined;
  onRepeatChange?: ((every: RepeatEvery) => void) | undefined;
  onStopRepeating?: (() => void) | undefined;
  pending?: boolean | undefined;
}

function HollerRounds({
  rounds,
  currentId,
  canEdit = false,
  now,
  onRepeatChange,
  onStopRepeating,
  pending = false,
  className,
  ...props
}: Props) {
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
          {canEdit && (next || rounds.repeat) && (
            <div className="flex flex-wrap items-center gap-2">
              {next && (
                <Button size="sm" render={<Link to="/hollers/$id" params={{ id: next.id }} />}>
                  <Pencil aria-hidden />
                  Edit next round
                </Button>
              )}
              {rounds.repeat && onRepeatChange && onStopRepeating && (
                <RepeatMenu
                  repeat={rounds.repeat}
                  nextRoundAt={next?.sendAt ?? null}
                  onRepeatChange={onRepeatChange}
                  onStopRepeating={onStopRepeating}
                  pending={pending}
                />
              )}
            </div>
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

const everyLabel: Record<RepeatEvery, string> = {
  week: "Every week",
  fortnight: "Every fortnight",
};

const repeatsLabel: Record<RepeatEvery, string> = {
  week: "Repeats every week",
  fortnight: "Repeats every fortnight",
};

function RepeatMenu({
  repeat,
  nextRoundAt,
  onRepeatChange,
  onStopRepeating,
  pending,
}: {
  repeat: RepeatEvery;
  nextRoundAt: string | null;
  onRepeatChange: (every: RepeatEvery) => void;
  onStopRepeating: () => void;
  pending: boolean;
}) {
  const [stopping, setStopping] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button size="sm" aria-label={repeatsLabel[repeat]} pending={pending} />}
        >
          {everyLabel[repeat]}
          <ChevronDown aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label="How often it repeats" align="end">
          <DropdownMenuRadioGroup
            value={repeat}
            onValueChange={(value) => {
              const every = repeatEvery.find((option) => option === value);
              if (every) onRepeatChange(every);
            }}
          >
            {repeatEvery.map((every) => (
              <DropdownMenuRadioItem key={every} value={every}>
                {everyLabel[every]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setStopping(true)}>
            <RepeatOff />
            Stop repeating
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={stopping} onOpenChange={setStopping}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop repeating this pulse?</DialogTitle>
            <DialogDescription>
              {nextRoundAt
                ? `The next round, on ${shortDate(nextRoundAt)}, is deleted. Every round so far and its answers stay.`
                : "No more rounds go out. Every round so far and its answers stay."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Keep repeating</Button>} />
            <Button
              variant="primary"
              onClick={() => {
                onStopRepeating();
                setStopping(false);
              }}
            >
              Stop repeating
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
