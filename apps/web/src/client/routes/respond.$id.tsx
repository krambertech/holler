import {
  modeLabels,
  type RespondForm,
  type RespondPerson,
  type RespondQuestion,
} from "@holler/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  Clock,
  ExternalLink,
  ListChecks,
  EyeOff,
  Link2Off,
  ListOrdered,
  Lock,
  Trash2,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ErrorState } from "@/components/error-state";
import { Logo } from "@/components/logo";
import { modeIcons } from "@/components/mode-glyph";
import { AnswerQuestion } from "@/components/respond/answer-question";
import { RespondState } from "@/components/respond/respond-state";
import { Skeleton } from "@/components/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Plate, PlateRow } from "@/components/ui/plate";
import { ApiError, api } from "@/lib/api";
import { closesIn, count, questionsLabel } from "@/lib/format";
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
  const [sent, setSent] = useState(false);
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
        <Button size="lg" render={<a href={`/answers/${holler.id}`} />}>
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
  const ModeIcon = modeIcons[holler.mode];
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
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted text-sm [&_svg]:size-4 [&_svg]:shrink-0">
            <li className="flex items-center gap-1.5">
              <ModeIcon aria-hidden strokeWidth={2} />
              {modeLabels[holler.mode]}
            </li>
            {questions.length > 0 && (
              <li className="flex items-center gap-1.5">
                <ListOrdered aria-hidden strokeWidth={2} />
                {questionsLabel(questions.length)}
              </li>
            )}
            {holler.closesAt && (
              <li className="flex items-center gap-1.5">
                <Clock aria-hidden strokeWidth={2} />
                <ClosesIn at={holler.closesAt} />
              </li>
            )}
            {holler.anonymous && (
              <li>
                <Chip variant="tint">
                  <EyeOff aria-hidden strokeWidth={2} />
                  Anonymous
                </Chip>
              </li>
            )}
          </ul>
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
        <PlateRow className="flex flex-col gap-10 px-6 py-7 sm:px-8 sm:py-8">
          {questions.map((question, index) => (
            <AnswerQuestion
              key={question.id}
              number={questions.length > 1 ? index + 1 : undefined}
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
          ))}
        </PlateRow>
        <SendBar
          pending={send.isPending}
          chase={holler.mode === "chase"}
          message={failed ?? (waiting > 0 ? problemsLine(waiting, questions) : null)}
        />
      </Plate>
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
    <PlateRow className="flex flex-col-reverse items-stretch gap-3 bg-canvas/60 px-6 py-5 sm:flex-row sm:items-center sm:justify-end sm:px-8">
      {message && (
        <p role="alert" className="text-danger-ink text-sm sm:me-auto">
          {message}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" pending={pending} className="sm:min-w-48">
        {chase ? "I submitted it" : "Send answers"}
      </Button>
    </PlateRow>
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
