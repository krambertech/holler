import { anonymousThreshold, modeLabels, type ReportOut } from "@holler/core";
import type { ComponentProps } from "react";
import { Logo } from "@/components/logo";
import { type PersonLookup, QuestionResult } from "@/components/results/question-result";
import { Plate } from "@/components/ui/plate";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { count, dayAndTime } from "@/lib/format";

interface Props extends ComponentProps<"main"> {
  report: ReportOut;
}

const nobody: ReadonlyMap<string, PersonLookup> = new Map<string, PersonLookup>();

function ReportView({ report, className, ...props }: Props) {
  const share = report.recipientCount === 0 ? 0 : report.answeredCount / report.recipientCount;
  const details = [modeLabels[report.mode]];
  if (report.anonymous) details.push("Anonymous");
  details.push(
    report.status === "closed" && report.closedAt
      ? `Closed ${dayAndTime(report.closedAt)}`
      : "Still taking answers",
  );
  return (
    <main
      data-slot="report-view"
      className={cn(
        "mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 pt-6 pb-12 sm:px-10 sm:pt-7 lg:px-20",
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-3">
        <Logo />
        <span className="truncate text-muted text-sm">{report.workspaceName}</span>
      </div>
      <header>
        <p className="text-muted text-sm">Results</p>
        <h1 className="text-pretty text-4xl tracking-title">{report.title}</h1>
        <p className="mt-2 text-muted text-sm">{details.join(" · ")}</p>
      </header>
      <Plate className="px-5 py-4">
        <h2 className="text-lg tabular">
          {count(report.answeredCount)} of {count(report.recipientCount)} answered
        </h2>
        <ProgressBar value={share} className="mt-2" />
      </Plate>
      {report.results.state === "gated" ? (
        <Plate className="px-6 py-5">
          <h2 className="text-lg">Results open at {anonymousThreshold} answers</h2>
          <p className="mt-1 max-w-[60ch] text-ink-2">
            This Holler is anonymous, so its results stay closed until enough people answered that
            no one can be picked out.{" "}
            {report.results.needed === 1
              ? "One more answer opens them."
              : `${count(report.results.needed)} more answers open them.`}
          </p>
        </Plate>
      ) : (
        <section aria-label="Results" className="flex flex-col gap-4">
          {report.results.questions.map((question, index) => (
            <QuestionResult
              key={question.id}
              question={question}
              number={index + 1}
              people={nobody}
            />
          ))}
        </section>
      )}
      <p className="text-muted text-sm">
        A read-only report from Holler. It shows what people answered and never who.
      </p>
    </main>
  );
}

export { ReportView };
