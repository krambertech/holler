import type { HollerSummary } from "@holler/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { HollerRow } from "@/components/holler-row";
import { Button, buttonClasses } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/chip";
import { Plate, PlateStrip } from "@/components/ui/plate";
import { Segmented } from "@/components/ui/segmented";
import { count } from "@/lib/format";
import { hollersQuery, homeCountsQuery } from "@/lib/queries";

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

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl tracking-title">Your hollers</h1>
        <div className="flex gap-2">
          <Button
            variant="icon"
            aria-label={searching ? "Close search" : "Search"}
            aria-expanded={searching}
            onClick={() => {
              if (searching) navigate({ search: (s) => ({ ...s, q: undefined }) });
              setSearching(!searching);
            }}
          >
            {searching ? <X size={18} strokeWidth={2} /> : <Search size={18} strokeWidth={2} />}
          </Button>
          {/* The editor owns /new; until it lands this link reaches the not-found page. */}
          <a href="/new" className={buttonClasses("primary")}>
            <Plus aria-hidden size={18} strokeWidth={2} />
            New holler
          </a>
        </div>
      </div>

      {searching && (
        <label className="flex h-10 items-center gap-2 rounded-control bg-plate px-3 shadow-[0_0_0_1px_var(--edge-2)] focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-2">
          <Search aria-hidden size={16} strokeWidth={2} className="text-muted" />
          <span className="sr-only">Search hollers by title</span>
          <input
            // biome-ignore lint/a11y/noAutofocus: the search field opens because the member asked for it.
            autoFocus
            defaultValue={q}
            placeholder="Search by title"
            className="h-full flex-1 bg-transparent text-md outline-none placeholder:text-muted"
            onChange={(event) =>
              navigate({
                search: (s) => ({ ...s, q: event.target.value || undefined }),
                replace: true,
              })
            }
          />
        </label>
      )}

      <HomeNumbers counts={counts.data} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Whose hollers"
          value={tab}
          onValueChange={(next) => navigate({ search: (s) => ({ ...s, tab: next }) })}
          items={[
            { value: "mine", label: "Mine", ...(mine.data ? { count: mine.data.length } : {}) },
            {
              value: "shared",
              label: "Shared with me",
              ...(shared.data ? { count: shared.data.length } : {}),
            },
          ]}
        />
        {tag && (
          <button
            type="button"
            onClick={() => navigate({ search: (s) => ({ ...s, tag: undefined }) })}
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-plate px-2.5 text-sm shadow-[0_0_0_1px_var(--edge-2)] hover:bg-well"
          >
            Tag: {tag}
            <X
              aria-label="Remove the tag filter"
              size={14}
              strokeWidth={2}
              className="text-muted"
            />
          </button>
        )}
      </div>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <Plate className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <span className="text-ink-2">{list.error.message}</span>
          <Button onClick={() => list.refetch()}>Try again</Button>
        </Plate>
      ) : list.data.length === 0 ? (
        <EmptyList tab={tab} filtered={Boolean(tag || q)} />
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
          <div className="tabular font-normal text-2xl">
            {cell.value === undefined ? <span className="text-faint">–</span> : count(cell.value)}
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
                className="hidden grid-cols-[minmax(0,1fr)_92px_96px_96px] gap-4 px-5 text-xs text-muted sm:grid"
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

function EmptyList({ tab, filtered }: { tab: "mine" | "shared"; filtered: boolean }) {
  if (filtered) {
    return (
      <EmptyState
        title="Nothing matches"
        body="No holler has that title or tag. Clear the search or the tag to see them all."
      />
    );
  }
  if (tab === "shared") {
    return (
      <EmptyState
        title="Nothing shared with you yet"
        body="When someone shares a Holler's results with you, or with the whole workspace, it shows up here."
      />
    );
  }
  return (
    <EmptyState
      title="Ask your team something"
      body="Holler sends your question to each person in Slack, reminds the ones who have not answered, and shows you the results here."
      action={
        <a href="/new" className={buttonClasses("primary")}>
          New holler
        </a>
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
          <span className="size-[38px] animate-pulse rounded-glyph bg-well" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3.5 w-2/5 animate-pulse rounded-full bg-well" />
            <span className="h-3 w-1/4 animate-pulse rounded-full bg-well" />
          </span>
        </div>
      ))}
    </Plate>
  );
}
