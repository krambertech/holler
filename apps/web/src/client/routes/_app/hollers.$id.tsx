import type { HollerOut } from "@holler/core";
import { anonymousThreshold, modeLabels } from "@holler/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { ErrorState } from "@/components/error-state";
import { ModeGlyph } from "@/components/mode-glyph";
import { HollerActions } from "@/components/results/holler-actions";
import { HollerPeople } from "@/components/results/holler-people";
import { type PersonLookup, QuestionResult } from "@/components/results/question-result";
import { Skeleton } from "@/components/skeleton";
import { Chip, StatusChip } from "@/components/ui/chip";
import { Plate } from "@/components/ui/plate";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { closesLabel, count, dayAndTime, momentLabel } from "@/lib/format";
import { hollerPeopleQuery, resultsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/hollers/$id")({
  component: HollerPage,
});

const statusWord = {
  live: "Live",
  closed: "Closed",
  scheduled: "Scheduled",
  draft: "Draft",
} as const;

function HollerPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const holler = useQuery({
    queryKey: ["hollers", id],
    queryFn: () => api<HollerOut>(`/hollers/${id}`),
  });
  const sent = holler.data?.status === "live" || holler.data?.status === "closed";
  const results = useQuery({ ...resultsQuery(id), enabled: sent });
  const people = useQuery({ ...hollerPeopleQuery(id), enabled: sent });
  const isCreator = holler.data?.isCreator ?? false;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["hollers"] });
  const remind = useMutation({
    mutationFn: () => api<HollerOut>(`/hollers/${id}/remind`, { method: "POST" }),
    onSuccess: () => {
      const waiting = people.data?.waitingCount ?? 0;
      toast.add({
        title:
          waiting === 1
            ? "Reminder sent to the 1 person still waiting."
            : `Reminder sent to the ${count(waiting)} people still waiting.`,
      });
      void refresh();
    },
    onError: (error) => toast.add({ tone: "danger", title: error.message }),
  });
  const close = useMutation({
    mutationFn: () => api<HollerOut>(`/hollers/${id}/close`, { method: "POST" }),
    onSuccess: () => {
      toast.add({ title: "Closed. It takes no more answers." });
      void refresh();
    },
    onError: (error) => toast.add({ tone: "danger", title: error.message }),
  });
  const copy = useMutation({
    mutationFn: () => api<{ id: string }>(`/hollers/${id}/copy`, { method: "POST" }),
    onSuccess: (draft) => {
      void queryClient.invalidateQueries({ queryKey: ["hollers"], refetchType: "none" });
      void navigate({ href: `/new?draft=${encodeURIComponent(draft.id)}` });
    },
    onError: (error) => toast.add({ tone: "danger", title: error.message }),
  });
  const copyAsMarkdown = async () => {
    try {
      const response = await fetch(`/api/hollers/${id}/export?format=md`, {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("We could not copy the results. Try again.");
      await navigator.clipboard.writeText(await response.text());
      toast.add({ title: "Copied the results as Markdown." });
    } catch (error) {
      toast.add({
        tone: "danger",
        title: error instanceof Error ? error.message : "We could not copy the results.",
      });
    }
  };

  const lookup = useMemo(() => {
    const map = new Map<string, PersonLookup>();
    for (const r of people.data?.recipients ?? []) {
      map.set(r.slackUserId, { name: r.name, avatarUrl: r.avatarUrl });
    }
    return map;
  }, [people.data]);

  if (holler.isPending) return <HollerSkeleton />;
  if (holler.isError) {
    return (
      <ErrorState
        title="We could not load this Holler"
        description={holler.error.message}
        onRetry={() => holler.refetch()}
        pending={holler.isRefetching}
      />
    );
  }
  const h = holler.data;
  const live = h.status === "live";

  return (
    <>
      <Link
        to="/"
        className="relative inline-flex w-fit items-center gap-1.5 rounded-sm py-1 text-ink-2 hoverable:hover:text-ink pointer-coarse:before:absolute pointer-coarse:before:-inset-2 pointer-coarse:before:content-['']"
      >
        <ArrowLeft aria-hidden size={16} strokeWidth={2} />
        Your hollers
      </Link>
      <header className="flex flex-wrap items-start gap-4">
        <ModeGlyph mode={h.mode} quiet={!live} />
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-pretty text-4xl tracking-title">{h.displayTitle || "Untitled"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-muted text-sm">
            {/* Only a live Holler is calling; scheduled, draft and closed are all quiet. */}
            <StatusChip status={live ? "live" : "closed"}>{statusWord[h.status]}</StatusChip>
            <span>{modeLabels[h.mode]}</span>
            {h.anonymous && <Chip variant="tint">Anonymous</Chip>}
            {live && h.closesAt && <span>Closes {closesLabel(h.closesAt)}</span>}
            {h.status === "closed" && h.closedAt && <span>Closed {dayAndTime(h.closedAt)}</span>}
          </div>
        </div>
        {sent && (
          <HollerActions
            hollerId={h.id}
            status={h.status}
            isCreator={isCreator}
            canExport={results.data?.state === "open"}
            waitingCount={people.data?.waitingCount ?? 0}
            onCopyAsMarkdown={() => void copyAsMarkdown()}
            onCopyIntoDraft={() => copy.mutate()}
            onClose={() => close.mutate()}
            copying={copy.isPending}
            closing={close.isPending}
          />
        )}
      </header>

      {h.status === "scheduled" && h.sendAt && (
        <Plate className="px-6 py-5">
          <h2 className="text-lg">Sends {momentLabel(h.sendAt)}</h2>
          <p className="mt-1 max-w-[60ch] text-ink-2">
            Who answered and the results show here once it goes out.
          </p>
        </Plate>
      )}

      {people.data && (
        <HollerPeople
          people={people.data}
          anonymous={h.anonymous}
          live={live}
          canRemind={isCreator}
          onRemind={() => remind.mutate()}
          reminding={remind.isPending}
        />
      )}

      {results.data?.state === "gated" && (
        <Plate className="px-6 py-5">
          <h2 className="text-lg">Results open at {anonymousThreshold} answers</h2>
          <p className="mt-1 max-w-[60ch] text-ink-2">
            This Holler is anonymous, so its results stay closed until enough people answered that
            no one can be picked out.{" "}
            {results.data.needed === 1
              ? "One more answer opens them."
              : `${results.data.needed} more answers open them.`}
          </p>
        </Plate>
      )}

      {results.data?.state === "open" && results.data.questions.length > 0 && (
        <section aria-labelledby="results-heading" className="flex flex-col gap-4">
          <h2 id="results-heading" className="text-xl">
            Results
          </h2>
          {results.data.questions.map((question, index) => (
            <QuestionResult
              key={question.id}
              question={question}
              number={index + 1}
              people={h.anonymous ? new Map() : lookup}
            />
          ))}
        </section>
      )}
    </>
  );
}

function HollerSkeleton() {
  return (
    <section aria-busy aria-label="Loading this Holler" className="flex flex-col gap-6">
      <Skeleton className="h-4 w-28 rounded-full" />
      <div className="flex items-start gap-4">
        <Skeleton className="size-[38px] rounded-glyph" />
        <div className="grid flex-1 gap-3">
          <Skeleton className="h-7 w-3/5 rounded-full" />
          <Skeleton className="h-6 w-48 rounded-full" />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <Plate key={i} className="grid gap-3 px-5 py-5">
          <Skeleton className="h-5 w-2/5 rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-4/5 rounded-full" />
        </Plate>
      ))}
    </section>
  );
}
