import type { QuestionResult as Result } from "@holler/core";
import { type ComponentProps, type ReactNode, useState } from "react";
import { kindLabel, TypeIcon } from "@/components/editor/questions/question-types";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { count, percent } from "@/lib/format";
import { numberRows } from "@/lib/number-rows";

export interface PersonLookup {
  name: string;
  avatarUrl: string | null;
}

export interface ScaleEnds {
  low: string | null;
  high: string | null;
}

interface Props extends ComponentProps<"section"> {
  question: Result;
  number: number;
  people: ReadonlyMap<string, PersonLookup>;
  ends?: ScaleEnds | undefined;
}

const FOLDED_TEXTS = 4;

function templateOf(question: Result): string {
  if (question.type !== "single") return question.type;
  if (question.style === "scale") return "rating";
  if (question.style === "binary") return "binary";
  return "single";
}

function QuestionResult({ question, number, people, ends, className, ...props }: Props) {
  const headingId = `question-${question.id}`;
  const template = templateOf(question);
  const answered = `${count(question.answeredCount)} answered`;
  return (
    <section aria-labelledby={headingId} data-slot="question-result" {...props}>
      <Plate className={cn(className)}>
        <div className="flex items-start gap-3 px-4 pt-4 pb-3 sm:px-5">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-sm bg-well text-ink-2 text-sm tabular"
          >
            {number}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 id={headingId} className="text-pretty text-lg">
              {question.prompt}
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-y-0.5 text-muted text-sm [&>*+*]:before:mx-1.5 [&>*+*]:before:content-['·']">
              <span className="inline-flex items-center gap-1.5">
                <TypeIcon kind={template} className="size-3.5" />
                {kindLabel(template)}
              </span>
              <span className="tabular sm:hidden">{answered}</span>
            </p>
          </div>
          <span className="shrink-0 pt-1 text-muted text-sm tabular max-sm:hidden">{answered}</span>
        </div>
        <div className="px-4 pb-5 sm:ps-15 sm:pe-5">
          <Body question={question} people={people} ends={ends} />
        </div>
      </Plate>
    </section>
  );
}

function Body({
  question,
  people,
  ends,
}: {
  question: Result;
  people: ReadonlyMap<string, PersonLookup>;
  ends?: ScaleEnds | undefined;
}) {
  if (question.answeredCount === 0) return <p className="text-muted">No answers yet.</p>;
  if (question.type === "text") return <TextAnswers texts={question.texts} people={people} />;
  if (question.type === "number") {
    const rows = numberRows(question.values);
    return (
      <>
        <Average value={question.average}>
          <span className="text-ink-2">average</span>
          <span className="text-muted text-sm tabular">
            Median {count(question.median ?? 0)} · Lowest {count(question.min ?? 0)} · Highest{" "}
            {count(question.max ?? 0)}
          </span>
        </Average>
        <ul className="grid gap-3">
          {rows.map((row) => (
            <Bar
              key={row.label}
              label={row.label}
              value={row.count}
              share={question.answeredCount === 0 ? 0 : row.count / question.answeredCount}
              pickedBy={row.slackUserIds}
              people={people}
            />
          ))}
        </ul>
      </>
    );
  }
  if (question.type === "person") {
    return (
      <ul className="grid gap-3">
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
  const scale = question.style === "scale";
  const last = question.options.length - 1;
  const top = question.options[last]?.label ?? "";
  const outOf = /^\d+$/.test(top) ? top : count(question.options.length);
  return (
    <>
      {scale && question.average !== null && (
        <Average value={question.average}>
          <span className="text-ink-2">average, out of {outOf}</span>
        </Average>
      )}
      <ul className="grid gap-3">
        {question.options.map((option, index) => (
          <Bar
            key={option.id}
            label={option.label}
            aside={scale ? endWord(ends, index, last) : undefined}
            value={option.count}
            share={option.share}
            pickedBy={option.slackUserIds}
            people={people}
          />
        ))}
      </ul>
      {question.type === "multi" && (
        <p className="mt-3 text-muted text-sm">
          People could pick more than one, so the shares can add up to more than 100%.
        </p>
      )}
      {question.otherTexts.length > 0 && (
        <Aside heading="Written beside Other" texts={question.otherTexts} people={people} />
      )}
      {question.notes.length > 0 && (
        <Aside heading="Notes" texts={question.notes} people={people} />
      )}
    </>
  );
}

function endWord(ends: ScaleEnds | undefined, index: number, last: number): string | undefined {
  if (index === 0) return ends?.low || undefined;
  if (index === last) return ends?.high || undefined;
  return undefined;
}

function Average({ value, children }: { value: number | null; children: ReactNode }) {
  if (value === null) return null;
  return (
    <p className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-3xl tracking-title">{count(value)}</span>
      {children}
    </p>
  );
}

function Bar({
  label,
  aside,
  value,
  share,
  leading,
  pickedBy,
  people,
}: {
  label: string;
  aside?: string | undefined;
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
          <span className="min-w-0 break-words">
            {label}
            {aside && <span className="text-muted"> · {aside}</span>}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-ink-2 text-sm tabular">
          {who.length > 0 && (
            <AvatarStack
              size="sm"
              people={who.slice(0, 5).map((p) => ({ ...p, answered: true }))}
              total={who.length}
              aria-label={`Picked by ${who.map((p) => p.name).join(", ")}`}
              title={who.map((p) => p.name).join(", ")}
            />
          )}
          <span>
            <span className="text-ink">{count(value)}</span> · {percent(share)}
          </span>
        </span>
      </div>
      <ProgressBar value={share} className="mt-1.5 h-2" />
    </li>
  );
}

type Written = { text: string; slackUserId: string | null }[];

function TextAnswers({
  texts,
  people,
}: {
  texts: Written;
  people: ReadonlyMap<string, PersonLookup>;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? texts : texts.slice(0, FOLDED_TEXTS);
  return (
    <>
      <WrittenList texts={shown} people={people} />
      {texts.length > FOLDED_TEXTS && (
        <Button
          variant="ghost"
          size="sm"
          className="-ms-3 mt-1"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Show fewer" : `Show all ${count(texts.length)}`}
        </Button>
      )}
    </>
  );
}

function Aside({
  heading,
  texts,
  people,
}: {
  heading: string;
  texts: Written;
  people: ReadonlyMap<string, PersonLookup>;
}) {
  return (
    <div className="mt-4 rounded-control bg-well px-4 pt-2.5 pb-0.5">
      <h4 className="text-ink-2 text-sm">
        {heading} <span className="text-muted tabular">{count(texts.length)}</span>
      </h4>
      <WrittenList texts={texts} people={people} size="sm" />
    </div>
  );
}

function WrittenList({
  texts,
  people,
  size = "md",
}: {
  texts: Written;
  people: ReadonlyMap<string, PersonLookup>;
  size?: "sm" | "md" | undefined;
}) {
  return (
    <ul>
      {texts.map((answer, index) => {
        const by = answer.slackUserId ? people.get(answer.slackUserId) : undefined;
        return (
          <li
            // oxlint-disable-next-line react/no-array-index-key -- written answers have no id of their own and never reorder
            key={index}
            className={cn(
              "flex items-start gap-3 border-t first:border-t-0",
              size === "sm" ? "border-edge py-2.5" : "border-divider py-3",
            )}
          >
            {by && answer.slackUserId && (
              <Avatar
                name={by.name}
                seed={answer.slackUserId}
                src={by.avatarUrl}
                size={size === "sm" ? "sm" : "md"}
                className="mt-0.5"
              />
            )}
            <span className="grid min-w-0 gap-0.5">
              {by && <span className="text-muted text-sm">{by.name}</span>}
              <q className="text-pretty before:content-none after:content-none">{answer.text}</q>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export { QuestionResult };
