import type { OwnHoller } from "@holler/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { OwnHollerRow } from "@/components/answers/own-holler-row";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/skeleton";
import { StatusDot } from "@/components/ui/chip";
import { Plate, PlateRow } from "@/components/ui/plate";
import { count } from "@/lib/format";
import { ownAnswersQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/answers/")({
  component: YourAnswers,
});

const groups = [
  { state: "waiting", label: "Waiting on you" },
  { state: "answered", label: "Answered" },
  { state: "missed", label: "Closed before you answered" },
] as const;

function YourAnswers() {
  const list = useQuery(ownAnswersQuery);
  return (
    <>
      <div className="grid gap-1.5">
        <h1 className="text-4xl tracking-title">Your answers</h1>
        <p className="text-ink-2">Every Holler sent to you in Slack, and what you said.</p>
      </div>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState
          title="We could not load your answers"
          onRetry={() => list.refetch()}
          pending={list.isRefetching}
        />
      ) : list.data.length === 0 ? (
        <EmptyState
          title="Nothing sent to you yet"
          description="When someone sends you a Holler in Slack, it shows up here with what you answered."
          preview={false}
        />
      ) : (
        <Groups hollers={list.data} />
      )}
    </>
  );
}

function Groups({ hollers }: { hollers: OwnHoller[] }) {
  return (
    <div className="flex flex-col gap-7">
      {groups.map((group) => {
        const rows = hollers.filter((h) => h.state === group.state);
        if (rows.length === 0) return null;
        return (
          <section
            key={group.state}
            aria-labelledby={`group-${group.state}`}
            className="flex flex-col gap-2.5"
          >
            <h2 id={`group-${group.state}`} className="flex items-center gap-2 px-1 text-lg">
              {group.state === "waiting" && <StatusDot status="waiting" className="size-2" />}
              {group.label}
              <span className="font-light text-sm text-muted tabular">{count(rows.length)}</span>
            </h2>
            <Plate>
              {rows.map((holler) => (
                <OwnHollerRow key={holler.id} holler={holler} />
              ))}
            </Plate>
          </section>
        );
      })}
    </div>
  );
}

function ListSkeleton() {
  return (
    <Plate aria-busy>
      {[0, 1, 2].map((row) => (
        <PlateRow key={row} className="flex items-center gap-3 px-5 py-[13px]">
          <Skeleton className="size-[34px] rounded-glyph" />
          <span className="grid flex-1 gap-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </span>
        </PlateRow>
      ))}
    </Plate>
  );
}
