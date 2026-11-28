import type { RespondForm, RespondPerson, RespondQuestion } from "@holler/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ExternalLink, ListChecks, Lock } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { SendBar } from "@/components/editor/send/send-bar";
import { ErrorState } from "@/components/error-state";
import { Logo } from "@/components/logo";
import { AnswerQuestion } from "@/components/respond/answer-question";
import { AnonymousNote, RespondHeader } from "@/components/respond/respond-header";
import { RespondState } from "@/components/respond/respond-state";
import { Skeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { Plate, PlateRow } from "@/components/ui/plate";
import { ProgressBar } from "@/components/ui/progress";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { closesIn, count } from "@/lib/format";
import { answeredCount, type Drafts, draftOf, problemsOf, toResponse } from "@/lib/respond";

export const Route = createFileRoute("/respond/$id")({
  validateSearch: z.object({
    u: z.string().catch(""),
    s: z.string().catch(""),
  }),
  component: RespondPage,
});

const formKey = (id: string, u: string) => ["respond", id, u] as const;

function RespondPage() {
  const { id } = Route.useParams();
  const { u, s } = Route.useSearch();
  const [sent, setSent] = useState(false);
  const form = useQuery({
    queryKey: formKey(id, u),
    queryFn: () => api<RespondForm>(`/respond/${id}?${new URLSearchParams({ u, s })}`),
    retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 2,
    refetchOnWindowFocus: false,
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col px-2 pt-5 sm:px-6 sm:pt-8">
      <div className="mb-4 self-center sm:mb-6">
        <Logo size={28} />
      </div>
      <Body form={form} id={id} link={{ u, s }} sent={sent} onSent={() => setSent(true)} />
    </main>
  );
}

interface BodyProps {
  form: ReturnType<typeof useQuery<RespondForm, Error>>;
  id: string;
  link: { u: string; s: string };
  sent: boolean;
  onSent: () => void;
}

function Body({ form, id, link, sent, onSent }: BodyProps) {
  if (form.isPending) return <FormSkeleton />;
  if (form.isError) {
    const error = form.error;
    if (error instanceof ApiError && (error.status === 403 || error.status === 400)) {
      return (
        <RespondState
          className="mb-10"
          drawing="locked"
          title="This link does not work"
          description="It may have been changed on the way. Open the Holler again from your message in Slack."
        />
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      return (
        <RespondState
          className="mb-10"
          drawing="search"
          title="This Holler is gone"
          description="Whoever sent it deleted it, so there is nothing to answer."
        />
      );
    }
    return (
      <ErrorState
        title="We could not load this Holler"
        onRetry={() => form.refetch()}
        pending={form.isRefetching}
      />
    );
  }
  const data = form.data;
  if (data.state === "answered") return <Answered holler={data.holler} arrive={sent} />;
  if (data.state === "closed") return <Closed holler={data.holler} />;
  return <OpenForm form={data} id={id} link={link} onSent={onSent} />;
}

type HollerInfo = RespondForm["holler"];

function Answered({ holler, arrive }: { holler: HollerInfo; arrive: boolean }) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  return (
    <RespondState
      className="mb-10"
      tone="answered"
      icon={<Check strokeWidth={2.5} />}
      title="Your answers are in"
      holler={holler}
      arrive={arrive}
      description={
        holler.anonymous
          ? `Thank you. Your name is not kept with them, so ${holler.senderName} never sees who said what.`
          : `Thank you. ${holler.senderName} sees them with everyone else's.`
      }
      action={
        <Button size="lg" render={<Link to="/answers/$id" params={{ id: holler.id }} />}>
          <ListChecks />
          See my answers
        </Button>
      }
    />
  );
}

function Closed({ holler }: { holler: HollerInfo }) {
  return (
    <RespondState
      className="mb-10"
      tone="closed"
      icon={<Lock strokeWidth={2} />}
      title="This Holler has closed"
      holler={holler}
      description={
        holler.closesAt
          ? `It stopped taking answers ${closesWhen(holler.closesAt, true)}.`
          : "It no longer takes answers."
      }
    />
  );
}

function closesWhen(iso: string, past = false): string {
  const at = new Date(iso);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  const near = Math.abs(at.getTime() - Date.now()) < 6 * 24 * 3600_000;
  const day = near
    ? new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(at)
    : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(at);
  return past && near ? `on ${day} at ${time}` : `${day} at ${time}`;
}

function useNow(every: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

function ClosesIn({ at }: { at: string }) {
  const now = useNow(30_000);
  return <>{closesIn(at, now)}</>;
}

function useDrafts(key: string) {
  const [drafts, setDrafts] = useState<Drafts>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as Drafts) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      if (Object.keys(drafts).length > 0) localStorage.setItem(key, JSON.stringify(drafts));
    } catch {}
  }, [key, drafts]);
  const forget = () => {
    try {
      localStorage.removeItem(key);
    } catch {}
  };
  return [drafts, setDrafts, forget] as const;
}

interface OpenFormProps {
  form: Extract<RespondForm, { state: "open" }>;
  id: string;
  link: { u: string; s: string };
  onSent: () => void;
}

function OpenForm({ form, id, link, onSent }: OpenFormProps) {
  const { holler, questions } = form;
  const queryClient = useQueryClient();
  const [drafts, setDrafts, forgetDrafts] = useDrafts(`holler:respond:${id}:${link.u}`);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const refs = useRef(new Map<string, HTMLFieldSetElement>());

  const send = useMutation({
    mutationFn: () =>
      api<RespondForm>(`/respond/${id}`, {
        method: "POST",
        json: { ...link, response: toResponse(questions, drafts) },
      }),
    onSuccess: (next) => {
      forgetDrafts();
      if (next.state === "answered") onSent();
      queryClient.setQueryData(formKey(id, link.u), next);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.field) {
        setProblems({ [error.field]: error.message });
        focusQuestion(error.field);
      }
    },
  });

  useEffect(() => {
    if (tried) setProblems(problemsOf(questions, drafts));
  }, [tried, questions, drafts]);

  function focusQuestion(questionId: string) {
    const el = refs.current.get(questionId);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    const found = problemsOf(questions, drafts);
    setProblems(found);
    const first = questions.find((q) => found[q.id]);
    if (first) {
      focusQuestion(first.id);
      return;
    }
    send.mutate();
  }

  const searchPeople = (q: string) =>
    api<{ people: RespondPerson[] }>(
      `/respond/${id}/people?${new URLSearchParams({ ...link, q })}`,
    ).then((r) => r.people);

  const waiting = Object.keys(problems).length;
  const failed =
    send.isError && !(send.error instanceof ApiError && send.error.field)
      ? send.error.message
      : null;
  const chase = holler.mode === "chase";

  return (
    <form noValidate onSubmit={submit} className="flex flex-1 flex-col">
      <Plate>
        <RespondHeader
          holler={holler}
          description={holler.description}
          closes={holler.closesAt ? <ClosesIn at={holler.closesAt} /> : undefined}
        />
        {holler.anonymous && <AnonymousNote senderName={holler.senderName} />}
        {chase && holler.externalUrl && (
          <PlateRow className="flex flex-col items-center gap-4 px-6 py-8 text-center sm:px-12">
            <p className="max-w-[44ch] text-pretty text-ink-2">
              The form lives somewhere else. Fill it in there, then come back and say you did.
            </p>
            <Button render={<a href={holler.externalUrl} target="_blank" rel="noreferrer" />}>
              Open the form
              <ExternalLink aria-hidden size={16} strokeWidth={2} />
            </Button>
          </PlateRow>
        )}
        {questions.length > 0 && (
          <PlateRow
            className={cn(
              "flex flex-col gap-14 px-5 pt-8 pb-9 sm:gap-16 sm:px-11 sm:pt-11 sm:pb-12",
              holler.anonymous && "border-t-0",
            )}
          >
            {questions.map((question, index) => (
              <AnswerQuestion
                key={question.id}
                number={questions.length > 1 ? index + 1 : undefined}
                ref={(el) => {
                  if (el) refs.current.set(question.id, el);
                  else refs.current.delete(question.id);
                }}
                tabIndex={-1}
                className="scroll-mt-24 outline-none"
                question={question}
                value={draftOf(drafts, question.id)}
                onValueChange={(next) => setDrafts((all) => ({ ...all, [question.id]: next }))}
                error={problems[question.id]}
                searchPeople={searchPeople}
              />
            ))}
          </PlateRow>
        )}
      </Plate>
      <SendBar
        className="mt-3"
        tone={failed || waiting > 0 ? "danger" : "neutral"}
        description={
          failed || waiting > 0 || questions.length === 0 ? undefined : (
            <ProgressBar
              className="mt-2 max-w-64"
              value={answeredCount(questions, drafts) / questions.length}
            />
          )
        }
        action={
          <Button type="submit" variant="primary" pending={send.isPending}>
            {chase ? "I submitted it" : "Send answers"}
          </Button>
        }
      >
        {failed ?? (waiting > 0 ? problemsLine(waiting, questions) : countLine(questions, drafts))}
      </SendBar>
    </form>
  );
}

function countLine(questions: readonly RespondQuestion[], drafts: Drafts): string {
  if (questions.length === 0) return "Filled in the form?";
  return `${count(answeredCount(questions, drafts))} of ${count(questions.length)} answered`;
}

function problemsLine(n: number, questions: readonly RespondQuestion[]): string {
  if (questions.length === 1) return "Answer the question to send.";
  if (n === 1) return "One question still needs an answer.";
  return `${count(n)} questions still need an answer.`;
}

function FormSkeleton() {
  return (
    <Plate>
      <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-7">
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-3/5" />
        <Skeleton className="h-4 w-48" />
      </div>
      {[0, 1].map((n) => (
        <PlateRow key={n} className="flex flex-col gap-3 px-5 py-8 sm:px-11">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </PlateRow>
      ))}
    </Plate>
  );
}
