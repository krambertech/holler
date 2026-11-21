import type { OwnAnswer } from "@holler/core";
import { modeLabels } from "@holler/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CircleCheck, Clock, ExternalLink, EyeOff, Lock } from "lucide-react";
import { GivenAnswers } from "@/components/answers/given-answers";
import { ErrorState } from "@/components/error-state";
import { ModeGlyph } from "@/components/mode-glyph";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { Chip, StatusChip } from "@/components/ui/chip";
import { Plate } from "@/components/ui/plate";
import { closesLabel, dayAndTime, longDate } from "@/lib/format";
import { ownAnswerQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/answers/$id")({
  component: OwnAnswerPage,
});

function BackLink() {
  return (
    <Link
      to="/answers"
      className="relative inline-flex w-fit items-center gap-1.5 rounded-sm py-1 text-ink-2 hoverable:hover:text-ink pointer-coarse:before:absolute pointer-coarse:before:-inset-2 pointer-coarse:before:content-['']"
    >
      <ArrowLeft aria-hidden size={16} strokeWidth={2} />
      Your answers
    </Link>
  );
}

function OwnAnswerPage() {
  const { id } = Route.useParams();
  const answer = useQuery(ownAnswerQuery(id));
  if (answer.isPending) return <AnswerSkeleton />;
  if (answer.isError) {
    return (
      <>
        <BackLink />
        <ErrorState
          title="We could not load your answers"
          description={answer.error.message}
          onRetry={() => answer.refetch()}
          pending={answer.isRefetching}
        />
      </>
    );
  }
  const a = answer.data;
  return (
    <>
      <BackLink />
      <header className="flex items-start gap-4">
        <ModeGlyph mode={a.mode} quiet={a.state !== "waiting"} />
        <div className="min-w-0 flex-1">
          <h1 className="text-4xl tracking-title">{a.title || "Untitled"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StateChip answer={a} />
            <span>{modeLabels[a.mode]}</span>
            <span>From {a.senderName}</span>
            {a.anonymous && <Chip variant="tint">Anonymous</Chip>}
          </div>
        </div>
      </header>
      <Body answer={a} />
    </>
  );
}

function StateChip({ answer }: { answer: OwnAnswer }) {
  if (answer.state === "answered" && answer.answeredAt) {
    return (
      <StatusChip status="answered">
        {answer.anonymous
          ? `Answered ${longDate(answer.answeredAt)}`
          : `Answered ${dayAndTime(answer.answeredAt)}`}
      </StatusChip>
    );
  }
  if (answer.state === "missed") return <StatusChip status="closed">Closed</StatusChip>;
  return <StatusChip status="waiting">Waiting on you</StatusChip>;
}

function Body({ answer }: { answer: OwnAnswer }) {
  if (answer.state === "waiting") {
    return (
      <Notice
        tone="warning"
        icon={<Clock />}
        title="You have not answered this one yet."
        description={
          answer.closesAt
            ? `It closes ${closesLabel(answer.closesAt)}. Answer from your message in Slack.`
            : "Answer from your message in Slack."
        }
        action={
          answer.slackUrl && (
            <Button
              variant="primary"
              render={<a href={answer.slackUrl} target="_blank" rel="noreferrer" />}
            >
              Answer in Slack
              <ExternalLink aria-hidden strokeWidth={2} />
            </Button>
          )
        }
      />
    );
  }
  if (answer.state === "missed") {
    return (
      <Notice
        icon={<Clock />}
        title="This Holler closed before you answered."
        description="It takes no more answers, so there is nothing of yours to show."
      />
    );
  }
  if (answer.mode === "chase") {
    return (
      <Notice
        tone="live"
        icon={<CircleCheck />}
        title="You marked this form as submitted."
        action={
          answer.externalUrl && (
            <Button render={<a href={answer.externalUrl} target="_blank" rel="noreferrer" />}>
              Open the form
              <ExternalLink aria-hidden strokeWidth={2} />
            </Button>
          )
        }
      />
    );
  }
  if (answer.given === null) {
    return (
      <Notice
        icon={<EyeOff />}
        title="Holler has no copy of these answers."
        description="You answered anonymously before Holler kept a private copy for you."
      />
    );
  }
  return (
    <>
      {answer.anonymous && (
        <Notice
          icon={<Lock />}
          title="Only you can see which answers are yours."
          description={`${answer.senderName} sees the results without your name.`}
        />
      )}
      <GivenAnswers given={answer.given} />
    </>
  );
}

function AnswerSkeleton() {
  return (
    <>
      <Skeleton className="h-5 w-28" />
      <div className="flex items-start gap-4">
        <Skeleton className="size-[34px] rounded-glyph" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </div>
      <Plate className="grid gap-4 p-5">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-7 w-32 rounded-full" />
      </Plate>
    </>
  );
}
