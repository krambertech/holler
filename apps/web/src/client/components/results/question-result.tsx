import type { QuestionResult as Result } from "@holler/core";
import type { ComponentProps, ReactNode } from "react";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Plate } from "@/components/ui/plate";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { count, percent } from "@/lib/format";

export interface PersonLookup {
  name: string;
  avatarUrl: string | null;
}

interface Props extends ComponentProps<"section"> {
  question: Result;
  number: number;
  people: ReadonlyMap<string, PersonLookup>;
}

function QuestionResult({ question, number, people, className, ...props }: Props) {
  const headingId = `question-${question.id}`;
  return (
    <section aria-labelledby={headingId} data-slot="question-result" {...props}>
      <Plate className={cn(className)}>
        <div className="px-5 pt-4 pb-3">
          <h3 id={headingId} className="text-pretty text-lg">
            <span aria-hidden className="me-2 text-muted tabular">
              {number}
            </span>
            {question.prompt}
          </h3>
          <p className="mt-0.5 text-muted text-sm tabular">{summaryLine(question)}</p>
        </div>
        <Body question={question} people={people} />
      </Plate>
    </section>
  );
}

function summaryLine(question: Result): string {
  const answered = `${count(question.answeredCount)} answered`;
  if ((question.type === "single" || question.type === "multi") && question.average !== null) {
    return `${answered} · Average ${count(question.average)}`;
  }
  return answered;
}

function Body({
  question,
  people,
}: {
  question: Result;
  people: ReadonlyMap<string, PersonLookup>;
}) {
  if (question.type === "text") {
    return <Written texts={question.texts} people={people} empty="No written answers yet." />;
  }
  if (question.type === "number") {
    if (question.average === null) return <Empty>No answers yet.</Empty>;
    const cells = [
      { label: "Average", value: question.average },
      { label: "Median", value: question.median },
      { label: "Lowest", value: question.min },
      { label: "Highest", value: question.max },
    ];
    return (
      <dl className="grid grid-cols-2 gap-px border-divider border-t bg-divider sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="bg-plate px-5 py-3">
            <dt className="text-muted text-sm">{cell.label}</dt>
            <dd className="text-2xl tabular">{cell.value === null ? "" : count(cell.value)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (question.type === "person") {
    if (question.people.length === 0) return <Empty>No one picked yet.</Empty>;
    return (
      <ul className="grid gap-3 px-5 pb-5">
        {question.people.map((person) => (
          <Bar
            key={person.slackUserId}
            label={person.name}
            value={person.count}
            share={person.share}
            leading={
              <Avatar
                name={person.name}
                seed={person.slackUserId}
                src={people.get(person.slackUserId)?.avatarUrl}
                size="sm"
              />
            }
            pickedBy={person.pickedBy}
            people={people}
          />
        ))}
      </ul>
    );
  }
  return (
    <>
      <ul className="grid gap-3 px-5 pb-5">
        {question.options.map((option) => (
          <Bar
            key={option.id}
            label={option.label}
            value={option.count}
            share={option.share}
            pickedBy={option.slackUserIds}
            people={people}
          />
        ))}
      </ul>
      {question.otherTexts.length > 0 && (
        <Written heading="Written beside Other" texts={question.otherTexts} people={people} />
      )}
      {question.notes.length > 0 && (
        <Written heading="Notes" texts={question.notes} people={people} />
      )}
    </>
  );
}

function Bar({
  label,
  value,
  share,
  leading,
  pickedBy,
  people,
}: {
  label: string;
  value: number;
  share: number;
  leading?: ReactNode | undefined;
  pickedBy: string[];
  people: ReadonlyMap<string, PersonLookup>;
}) {
  const who = pickedBy.flatMap((id) => {
    const person = people.get(id);
    return person ? [{ slackUserId: id, name: person.name, avatarUrl: person.avatarUrl }] : [];
  });
  return (
    <li>
      <div className="flex items-center justify-between gap-3 text-base">
        <span className="flex min-w-0 items-center gap-2">
          {leading}
          <span className="min-w-0 break-words">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-muted tabular">
          {who.length > 0 && (
            <AvatarStack
              size="sm"
              people={who.slice(0, 4).map((p) => ({ ...p, answered: true }))}
              total={who.length}
              aria-label={`Picked by ${who.map((p) => p.name).join(", ")}`}
              title={who.map((p) => p.name).join(", ")}
            />
          )}
          <span>
            {count(value)} · {percent(share)}
          </span>
        </span>
      </div>
      <ProgressBar value={share} className="mt-1.5 h-2" />
    </li>
  );
}

function Written({
  heading,
  texts,
  people,
  empty,
}: {
  heading?: string | undefined;
  texts: { text: string; slackUserId: string | null }[];
  people: ReadonlyMap<string, PersonLookup>;
  empty?: string | undefined;
}) {
  if (texts.length === 0) return empty ? <Empty>{empty}</Empty> : null;
  return (
    <div className="border-divider border-t">
      {heading && <h4 className="px-5 pt-3 text-muted text-sm">{heading}</h4>}
      <ul>
        {texts.map((answer, index) => {
          const by = answer.slackUserId ? people.get(answer.slackUserId) : undefined;
          return (
            <li
              // oxlint-disable-next-line react/no-array-index-key -- written answers have no id of their own and never reorder
              key={index}
              className="grid gap-1 border-divider border-t px-5 py-3 first:border-t-0"
            >
              <q className="text-pretty text-ink-2 before:content-none after:content-none">
                {answer.text}
              </q>
              {by && answer.slackUserId && (
                <span className="flex items-center gap-2 text-muted text-sm">
                  <Avatar name={by.name} seed={answer.slackUserId} src={by.avatarUrl} size="sm" />
                  {by.name}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="border-divider border-t px-5 py-3 text-muted">{children}</p>;
}

export { QuestionResult };
