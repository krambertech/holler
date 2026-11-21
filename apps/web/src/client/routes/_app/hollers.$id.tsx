import type { QuestionResult } from "@holler/core";
import { anonymousThreshold, modeLabels } from "@holler/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { ModeGlyph } from "@/components/mode-glyph";
import { Skeleton } from "@/components/skeleton";
import { Chip, StatusChip } from "@/components/ui/chip";
import { Plate, PlateRow } from "@/components/ui/plate";
import { ProgressBar } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { closesLabel, count, percent } from "@/lib/format";
import { resultsQuery } from "@/lib/queries";

/**
 * A Holler's page: who answered and the results. The results, exports and sharing work fills this
 * in; the foundations draw the frame, the counts and one bar chart per question.
 */
export const Route = createFileRoute("/_app/hollers/$id")({
  component: HollerPage,
});

interface Holler {
  id: string;
  mode: "pulse" | "survey" | "chase";
  status: "draft" | "scheduled" | "live" | "closed";
  title: string;
  anonymous: boolean;
  closesAt: string | null;
  tags: string[];
}

function HollerPage() {
  const { id } = Route.useParams();
  const holler = useQuery({
    queryKey: ["hollers", id],
    queryFn: () => api<Holler>(`/hollers/${id}`),
  });
  const results = useQuery({ ...resultsQuery(id), enabled: holler.data?.status !== "draft" });

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

  return (
    <>
      <Link
        to="/"
        className="relative inline-flex w-fit items-center gap-1.5 rounded-sm py-1 text-ink-2 hoverable:hover:text-ink pointer-coarse:before:absolute pointer-coarse:before:-inset-2 pointer-coarse:before:content-['']"
      >
        <ArrowLeft aria-hidden size={16} strokeWidth={2} />
        Your hollers
      </Link>
      <header className="flex items-start gap-4">
        <ModeGlyph mode={h.mode} quiet={h.status !== "live"} />
        <div className="min-w-0 flex-1">
          <h1 className="text-4xl tracking-title">{h.title || "Untitled"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {/* Only a live Holler is calling; scheduled, draft and closed are all quiet. */}
            <StatusChip status={h.status === "live" ? "live" : "closed"}>
              {h.status === "live"
                ? "Live"
                : h.status === "closed"
                  ? "Closed"
                  : h.status === "scheduled"
                    ? "Scheduled"
                    : "Draft"}
            </StatusChip>
            <span>{modeLabels[h.mode]}</span>
            {h.anonymous && <Chip variant="tint">Anonymous</Chip>}
            {h.status === "live" && h.closesAt && <span>Closes {closesLabel(h.closesAt)}</span>}
          </div>
        </div>
      </header>

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

      {results.data?.state === "open" &&
        results.data.questions.map((question) => (
          <QuestionPlate key={question.id} question={question} />
        ))}
    </>
  );
}

function QuestionPlate({ question }: { question: QuestionResult }) {
  return (
    <Plate>
      <div className="flex items-baseline justify-between gap-4 px-5 pt-4 pb-3">
        <h2 className="text-lg">{question.prompt}</h2>
        <span className="shrink-0 text-sm text-muted tabular">
          {count(question.answeredCount)} answered
        </span>
      </div>
      {question.type === "text" ? (
        question.texts.length === 0 ? (
          <PlateRow className="px-5 py-3 text-muted">No written answers yet.</PlateRow>
        ) : (
          question.texts.map((answer, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: text answers have no id of their own and never reorder.
            <PlateRow key={index} className="px-5 py-3 text-ink-2">
              <q className="before:content-none after:content-none">{answer.text}</q>
            </PlateRow>
          ))
        )
      ) : question.type === "number" ? (
        <PlateRow className="px-5 py-3 text-ink-2 tabular">
          {question.average === null
            ? "No answers yet."
            : `Average ${question.average} · median ${question.median} · from ${question.min} to ${question.max}`}
        </PlateRow>
      ) : question.type === "person" ? (
        question.people.length === 0 ? (
          <PlateRow className="px-5 py-3 text-muted">No one picked yet.</PlateRow>
        ) : (
          question.people.map((person) => (
            <PlateRow
              key={person.slackUserId}
              className="flex justify-between gap-3 px-5 py-3 text-base"
            >
              <span>{person.name}</span>
              <span className="text-muted tabular">
                {count(person.count)} · {percent(person.share)}
              </span>
            </PlateRow>
          ))
        )
      ) : (
        <div className="flex flex-col gap-3 px-5 pb-5">
          {question.average !== null && <Chip variant="tint">Average {question.average}</Chip>}
          {question.options.map((option) => (
            <div key={option.id}>
              <div className="flex items-baseline justify-between gap-3 text-base">
                <span>{option.label}</span>
                <span className="text-muted tabular">
                  {count(option.count)} · {percent(option.share)}
                </span>
              </div>
              <ProgressBar value={option.share} className="mt-1.5 h-2" />
            </div>
          ))}
        </div>
      )}
    </Plate>
  );
}

/** The page's shape while it loads: the title, its chips, and two question plates. */
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
      {[0, 1].map((i) => (
        <Plate key={i} className="grid gap-3 px-5 py-5">
          <Skeleton className="h-5 w-2/5 rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-4/5 rounded-full" />
        </Plate>
      ))}
    </section>
  );
}
