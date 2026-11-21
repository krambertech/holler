import {
  modeLabels,
  type RespondForm,
  type RespondGiven,
  type RespondPerson,
  type RespondQuestion,
} from "@holler/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ExternalLink, Link2Off, Lock, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ErrorState } from "@/components/error-state";
import { Logo } from "@/components/logo";
import { AnswerQuestion } from "@/components/respond/answer-question";
import { RespondState } from "@/components/respond/respond-state";
import { YourAnswers } from "@/components/respond/your-answers";
import { Skeleton } from "@/components/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Plate, PlateRow } from "@/components/ui/plate";
import { ApiError, api } from "@/lib/api";
import { count, questionsLabel } from "@/lib/format";
import { markdown } from "@/lib/markdown";
import { type Drafts, draftOf, problemsOf, toResponse } from "@/lib/respond";

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
  const form = useQuery({
    queryKey: formKey(id, u),
    queryFn: () => api<RespondForm>(`/respond/${id}?${new URLSearchParams({ u, s })}`),
    retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 2,
    refetchOnWindowFocus: false,
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[680px] flex-col gap-5 px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <div className="px-1">
        <Logo size={28} />
      </div>
      <Body form={form} id={id} link={{ u, s }} />
    </main>
  );
}

interface BodyProps {
  form: ReturnType<typeof useQuery<RespondForm, Error>>;
  id: string;
  link: { u: string; s: string };
}

function Body({ form, id, link }: BodyProps) {
  if (form.isPending) return <FormSkeleton />;
  if (form.isError) {
    const error = form.error;
    if (error instanceof ApiError && (error.status === 403 || error.status === 400)) {
      return (
        <RespondState
          icon={<Link2Off strokeWidth={2} />}
          title="This link does not work"
          description="It may have been changed on the way. Open the Holler again from your message in Slack."
        />
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      return (
        <RespondState
          icon={<Trash2 strokeWidth={2} />}
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
  if (data.state === "answered") return <Answered holler={data.holler} given={data.given} />;
  if (data.state === "closed") return <Closed holler={data.holler} />;
  return <OpenForm form={data} id={id} link={link} />;
}

type HollerInfo = RespondForm["holler"];

function Answered({ holler, given }: { holler: HollerInfo; given: RespondGiven[] | null }) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  return (
    <RespondState
      tone="answered"
      icon={<Check strokeWidth={2} />}
      title="Thank you, your answers are in"
      holler={holler}
      description={
        <>
          <p>
            {holler.anonymous
              ? `Your name is not kept with your answers, so ${holler.senderName} sees how many people answered, never who said what.`
              : `${holler.senderName} sees them with everyone else's.`}
          </p>
          <p>You can close this page.</p>
        </>
      }
    >
      {given && given.length > 0 && <YourAnswers given={given} />}
    </RespondState>
  );
}

function Closed({ holler }: { holler: HollerInfo }) {
  return (
    <RespondState
      tone="closed"
      icon={<Lock strokeWidth={2} />}
      title="This Holler is closed"
      holler={holler}
      description={
        holler.closesAt
          ? `It closed ${closesWhen(holler.closesAt, true)}, so it takes no more answers.`
          : "It takes no more answers."
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
}

function OpenForm({ form, id, link }: OpenFormProps) {
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

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <Plate>
        <PlateRow className="flex flex-col gap-3 px-6 py-6 sm:px-8 sm:py-7">
          <p className="flex items-center gap-2 text-muted text-sm">
            <Avatar
              size="md"
              name={holler.senderName}
              seed={holler.senderSlackUserId}
              src={holler.senderAvatarUrl}
            />
            {holler.senderName} sent you a Holler
          </p>
          <h1 className="text-balance text-4xl tracking-title">{holler.title}</h1>
          {holler.description.trim() && (
            <div className="flex flex-col gap-3 text-pretty text-ink-2">
              {markdown(holler.description)}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted text-sm">
            <span>{modeLabels[holler.mode]}</span>
            {questions.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{questionsLabel(questions.length)}</span>
              </>
            )}
            {holler.closesAt && (
              <>
                <span aria-hidden="true">·</span>
                <span>Closes {closesWhen(holler.closesAt)}</span>
              </>
            )}
            {holler.anonymous && (
              <Chip variant="tint" className="ms-1">
                Anonymous
              </Chip>
            )}
          </div>
          {holler.anonymous && (
            <p className="text-muted text-sm">
              Your name is not kept with your answers. {holler.senderName} sees how many people
              answered, never who said what.
            </p>
          )}
        </PlateRow>
        {holler.mode === "chase" && holler.externalUrl && (
          <PlateRow className="flex flex-col items-start gap-3 px-6 py-6 sm:px-8">
            <p className="text-ink-2">
              The form lives somewhere else. Fill it in there, then come back and say you did.
            </p>
            <Button render={<a href={holler.externalUrl} target="_blank" rel="noreferrer" />}>
              Open the form
              <ExternalLink aria-hidden size={16} strokeWidth={2} />
            </Button>
          </PlateRow>
        )}
        {questions.map((question) => (
          <PlateRow key={question.id} className="px-6 py-6 sm:px-8 sm:py-7">
            <AnswerQuestion
              ref={(el) => {
                if (el) refs.current.set(question.id, el);
                else refs.current.delete(question.id);
              }}
              tabIndex={-1}
              className="outline-none"
              question={question}
              value={draftOf(drafts, question.id)}
              onValueChange={(next) => setDrafts((all) => ({ ...all, [question.id]: next }))}
              error={problems[question.id]}
              searchPeople={searchPeople}
            />
          </PlateRow>
        ))}
      </Plate>
      <SendBar
        pending={send.isPending}
        chase={holler.mode === "chase"}
        message={failed ?? (waiting > 0 ? problemsLine(waiting, questions) : null)}
      />
    </form>
  );
}

function problemsLine(n: number, questions: readonly RespondQuestion[]): string {
  if (questions.length === 1 || n === 1) return "One answer needs another look.";
  return `${count(n)} answers need another look.`;
}

function SendBar({
  pending,
  chase,
  message,
}: {
  pending: boolean;
  chase: boolean;
  message: string | null;
}) {
  return (
    <div className="flex flex-col-reverse items-stretch gap-3 px-1 sm:flex-row sm:items-center sm:justify-end">
      {message && (
        <p role="alert" className="text-danger-ink text-sm sm:me-auto">
          {message}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" pending={pending} className="sm:min-w-48">
        {chase ? "I submitted it" : "Send answers"}
      </Button>
    </div>
  );
}

function FormSkeleton() {
  return (
    <Plate>
      <PlateRow className="flex flex-col gap-3 px-6 py-7 sm:px-8">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-56" />
      </PlateRow>
      {[0, 1].map((n) => (
        <PlateRow key={n} className="flex flex-col gap-3 px-6 py-6 sm:px-8">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </PlateRow>
      ))}
    </Plate>
  );
}
