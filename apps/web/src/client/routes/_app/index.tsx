import type { HollerSummary } from "@holler/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { HollerRow } from "@/components/holler-row";
import { Skeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/chip";
import { Input, InputGroup } from "@/components/ui/input";
import { Plate, PlateStrip } from "@/components/ui/plate";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { count } from "@/lib/format";
import { waitingFor } from "@/lib/pages";
import { hollersQuery, homeCountsQuery } from "@/lib/queries";

const newHoller = waitingFor("#11", "/new");

const searchSchema = z.object({
  tab: z.enum(["mine", "shared"]).optional().catch(undefined),
  tag: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_app/")({
  validateSearch: searchSchema,
  component: Home,
});

function Home() {
  const { tab = "mine", tag, q } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const counts = useQuery(homeCountsQuery);
  const mine = useQuery(hollersQuery("mine", { tag, q }));
  const shared = useQuery(hollersQuery("shared", { tag, q }));
  const list = tab === "mine" ? mine : shared;
  const [searching, setSearching] = useState(Boolean(q));
  // On a first visit the empty state carries the one plum New holler, so the header's steps back.
  const firstVisit = tab === "mine" && !tag && !q && mine.data?.length === 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl tracking-title">Your hollers</h1>
        <div className="flex gap-2">
          <Button
            size="icon"
            aria-label={searching ? "Close search" : "Search"}
            aria-expanded={searching}
            onClick={() => {
              if (searching) navigate({ search: (s) => ({ ...s, q: undefined }) });
              setSearching(!searching);
            }}
          >
            {searching ? <X aria-hidden strokeWidth={2} /> : <Search aria-hidden strokeWidth={2} />}
          </Button>
          {/* The editor owns /new; until it lands this link reaches the not-found page. */}
          <Button variant={firstVisit ? "secondary" : "primary"} render={<a href={newHoller} />}>
            <Plus aria-hidden strokeWidth={2} />
            New holler
          </Button>
        </div>
      </div>

      {searching && (
        <InputGroup icon={<Search />}>
          <Input
            aria-label="Search hollers by title"
            autoFocus
            defaultValue={q}
            placeholder="Search by title"
            onChange={(event) =>
              navigate({
                search: (s) => ({ ...s, q: event.target.value || undefined }),
                replace: true,
              })
            }
          />
        </InputGroup>
      )}

      <HomeNumbers counts={counts.data} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          aria-label="Whose hollers"
          value={tab}
          onValueChange={(next: "mine" | "shared") =>
            navigate({ search: (s) => ({ ...s, tab: next }) })
          }
        >
          <SegmentedItem value="mine" count={mine.data?.length ?? null}>
            Mine
          </SegmentedItem>
          <SegmentedItem value="shared" count={shared.data?.length ?? null}>
            Shared with me
          </SegmentedItem>
        </Segmented>
        {tag && (
          <Button
            size="sm"
            aria-label={`Remove the tag filter: ${tag}`}
            onClick={() => navigate({ search: (s) => ({ ...s, tag: undefined }) })}
            className="rounded-full"
          >
            Tag: {tag}
            <X aria-hidden strokeWidth={2} className="text-muted" />
          </Button>
        )}
      </div>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState
          title="We could not load your hollers"
          onRetry={() => list.refetch()}
          pending={list.isRefetching}
        />
      ) : list.data.length === 0 ? (
        <EmptyList
          tab={tab}
          filtered={Boolean(tag || q)}
          onClear={() => {
            setSearching(false);
            navigate({ search: (s) => ({ ...s, q: undefined, tag: undefined }) });
          }}
        />
      ) : (
        <Groups hollers={list.data} />
      )}
    </>
  );
}

function HomeNumbers({
  counts,
}: {
  counts: { live: number; waiting: number; scheduled: number } | undefined;
}) {
  const cells = [
    { value: counts?.live, label: "Live now", dot: true },
    { value: counts?.waiting, label: "People still to answer", dot: false },
    { value: counts?.scheduled, label: "Scheduled", dot: false },
  ];
  return (
    <Plate className="grid grid-cols-3">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="border-divider border-s px-4 py-3.5 first:border-s-0 sm:px-5"
        >
          <div className="tabular font-normal text-3xl">
            {cell.value === undefined ? <Skeleton className="my-1 h-6 w-8" /> : count(cell.value)}
          </div>
          <div className="mt-[3px] flex items-center gap-1.5 text-sm text-muted">
            {cell.dot && <StatusDot status="live" />}
            {cell.label}
          </div>
        </div>
      ))}
    </Plate>
  );
}

const groups = [
  { status: "live", label: "Live" },
  { status: "scheduled", label: "Scheduled" },
  { status: "draft", label: "Drafts" },
  { status: "closed", label: "Closed" },
] as const;

function Groups({ hollers }: { hollers: HollerSummary[] }) {
  return (
    <div className="flex flex-col gap-7">
      {groups.map((group) => {
        const rows = hollers.filter((h) => h.status === group.status);
        if (rows.length === 0) return null;
        const waiting =
          group.status === "live"
            ? rows.reduce((n, h) => n + h.recipientCount - h.answeredCount, 0)
            : 0;
        return (
          <section
            key={group.status}
            aria-labelledby={`group-${group.status}`}
            className="flex flex-col gap-2.5"
          >
            <h2 id={`group-${group.status}`} className="flex items-center gap-2 px-1 text-lg">
              {group.status === "live" && <StatusDot status="live" className="size-2" />}
              {group.label}
              <span className="font-light text-sm text-muted tabular">{rows.length}</span>
            </h2>
            {group.status === "live" && (
              <div
                aria-hidden
                className="hidden grid-cols-[minmax(0,1fr)_112px_96px_96px] gap-4 px-5 text-xs text-muted sm:grid"
              >
                <span>Holler</span>
                <span>People</span>
                <span>Answered</span>
                <span>Closes</span>
              </div>
            )}
            <Plate>
              {rows.map((holler) => (
                <HollerRow key={holler.id} holler={holler} />
              ))}
              {waiting > 0 && (
                <PlateStrip>
                  <span>
                    {waiting === 1
                      ? "1 person still to answer."
                      : `${count(waiting)} people still to answer.`}
                  </span>
                </PlateStrip>
              )}
            </Plate>
          </section>
        );
      })}
    </div>
  );
}

function EmptyList({
  tab,
  filtered,
  onClear,
}: {
  tab: "mine" | "shared";
  filtered: boolean;
  onClear: () => void;
}) {
  if (filtered) {
    return (
      <EmptyState
        role="status"
        variant="dashed"
        illustration="search"
        title="No holler matches"
        description="Search looks at titles, and the tag filter at exact tags."
        action={
          <Button size="sm" onClick={onClear}>
            Clear search and filters
          </Button>
        }
      />
    );
  }
  if (tab === "shared") {
    return (
      <EmptyState
        illustration="shared"
        title="Nothing shared with you yet"
        description="When someone shares a Holler's results with you, or with the whole workspace, it shows up here."
      />
    );
  }
  return (
    <EmptyState
      size="lg"
      illustration="hollers"
      title="Ask your team something"
      description="Holler sends your question to each person in Slack, reminds the ones who have not answered, and shows you the results here."
      action={
        <Button variant="primary" render={<a href={newHoller} />}>
          New holler
        </Button>
      }
    />
  );
}

function ListSkeleton() {
  return (
    <Plate aria-busy aria-label="Loading your hollers">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-divider border-t px-5 py-[13px] first:border-t-0"
        >
          <Skeleton className="size-[38px] rounded-glyph" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5 rounded-full" />
            <Skeleton className="h-3 w-1/4 rounded-full" />
          </span>
        </div>
      ))}
    </Plate>
  );
}
