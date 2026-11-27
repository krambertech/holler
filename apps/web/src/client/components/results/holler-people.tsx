import type { RecipientOut, RecipientsOut } from "@holler/core";
import { Bell } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { Plate, PlateRow, Underplate, UnderplateStrip } from "@/components/ui/plate";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { count, momentLabel } from "@/lib/format";
import { useWakeAt } from "@/lib/use-wake-at";

const FOLDED = 5;

interface Props extends ComponentProps<"section"> {
  people: RecipientsOut;
  anonymous: boolean;
  live: boolean;
  canRemind: boolean;
  onRemind?: (() => void) | undefined;
  reminding?: boolean | undefined;
  now?: Date | undefined;
}

function HollerPeople({
  people,
  anonymous,
  live,
  canRemind,
  onRemind,
  reminding = false,
  now: fixedNow,
  className,
  ...props
}: Props) {
  const [open, setOpen] = useState(false);
  const { recipientCount, answeredCount, waitingCount, recipients } = people;
  const reminderAt = people.reminderAvailableAt ? new Date(people.reminderAvailableAt) : null;
  useWakeAt(fixedNow ? null : reminderAt);
  const now = fixedNow ?? new Date();
  const ordered = anonymous ? recipients : [...recipients].sort((a, b) => rank(a) - rank(b));
  const pending = anonymous || !live ? [] : ordered.filter((person) => rank(person) < 3);
  const shown = open ? ordered : pending.slice(0, FOLDED);
  const canRemindNow = canRemind && reminderAt !== null && reminderAt <= now;
  const strip =
    live && waitingCount > 0 ? (
      <UnderplateStrip>
        <span>
          <ReminderLine people={people} now={now} />
        </span>
        {canRemind && (
          <Button
            variant="primary"
            size="sm"
            disabled={!canRemindNow}
            pending={reminding}
            onClick={onRemind}
          >
            <Bell aria-hidden />
            Send reminder
          </Button>
        )}
      </UnderplateStrip>
    ) : null;

  return (
    <section aria-labelledby="people-heading" data-slot="holler-people" {...props}>
      <Wrap className={className} strip={strip}>
        <Plate>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <h2 id="people-heading" className="whitespace-nowrap text-lg tabular">
                {count(answeredCount)} of {count(recipientCount)} answered
              </h2>
              {!anonymous && (
                <AvatarStack
                  people={recipients
                    .slice(0, 4)
                    .map((r) => ({ ...r, answered: r.answered ?? true }))}
                  total={recipientCount}
                  aria-label={`${count(recipientCount)} people, ${count(answeredCount)} answered`}
                />
              )}
            </div>
            <ProgressBar
              value={recipientCount === 0 ? 0 : answeredCount / recipientCount}
              className="mt-3"
            />
          </div>
          {shown.length > 0 && (
            <ul aria-label="People">
              {shown.map((person) => (
                <li
                  key={person.slackUserId}
                  className="flex items-center gap-3 border-divider border-t px-5 py-2.5"
                >
                  <Avatar
                    name={person.name}
                    seed={person.slackUserId}
                    src={person.avatarUrl}
                    waiting={person.answered === false}
                  />
                  <span className="min-w-0 flex-1 truncate text-base">{person.name}</span>
                  <PersonStatus person={person} live={live} />
                </li>
              ))}
            </ul>
          )}
          <PlateRow className="flex items-center gap-3 py-2 ps-5 pe-3">
            {open ? (
              <span className="flex-1" />
            ) : (
              <Folded
                people={people}
                ordered={ordered}
                shown={shown.length}
                anonymous={anonymous}
                live={live}
              />
            )}
            <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? "Show fewer" : "Show everyone"}
            </Button>
          </PlateRow>
          {anonymous && (
            <PlateRow className="px-5 py-3 text-ink-2 text-sm">
              This Holler is anonymous. You see how many answered, never who.
            </PlateRow>
          )}
        </Plate>
      </Wrap>
    </section>
  );
}

interface FoldedProps {
  people: RecipientsOut;
  ordered: RecipientOut[];
  shown: number;
  anonymous: boolean;
  live: boolean;
}

function Folded({ people, ordered, shown, anonymous, live }: FoldedProps) {
  if (anonymous) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <AvatarStack
          people={ordered.slice(0, 3).map((r) => ({ ...r, answered: true }))}
          total={people.recipientCount}
          aria-label={`${count(people.recipientCount)} people`}
        />
        <span className="text-ink-2 text-sm">
          {people.recipientCount === 1
            ? "Sent to 1 person"
            : `Sent to ${count(people.recipientCount)} people`}
        </span>
      </span>
    );
  }
  const answered = ordered.filter((r) => r.answered === true);
  const missing = ordered.filter((r) => r.answered !== true);
  if (!live) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-3">
        {missing.length > 0 && (
          <AvatarStack
            people={missing.slice(0, 3).map((r) => ({ ...r, answered: false }))}
            total={missing.length}
            aria-label={`${count(missing.length)} people did not answer`}
          />
        )}
        <span className="min-w-0 text-ink-2 text-sm">
          <NotAnswered names={missing.map((r) => r.name)} />
        </span>
      </span>
    );
  }
  const moreWaiting = missing.length - shown;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      {answered.length > 0 && (
        <AvatarStack
          people={answered.slice(0, 3).map((r) => ({ ...r, answered: true }))}
          total={answered.length}
          aria-label={`${count(answered.length)} answered`}
        />
      )}
      <span className="flex min-w-0 flex-wrap text-ink-2 text-sm tabular [&>*]:whitespace-nowrap [&>*+*]:before:mx-1.5 [&>*+*]:before:content-['·']">
        {moreWaiting > 0 && <span>{count(moreWaiting)} more waiting</span>}
        {answered.length > 0 && <span>{count(answered.length)} answered</span>}
      </span>
    </span>
  );
}

function NotAnswered({ names }: { names: string[] }) {
  if (names.length === 0) return <>Everyone answered.</>;
  if (names.length === 1) return <>{names[0]} did not answer.</>;
  if (names.length <= 3) {
    const list = new Intl.ListFormat("en", { type: "conjunction" }).format(names);
    return <>{list} did not answer.</>;
  }
  return <>{count(names.length)} people did not answer.</>;
}

function Wrap({
  strip,
  className,
  children,
}: {
  strip: ReactNode;
  className?: string | undefined;
  children: ReactNode;
}) {
  if (!strip) return <div className={cn(className)}>{children}</div>;
  return (
    <Underplate className={cn(className)}>
      {children}
      {strip}
    </Underplate>
  );
}

function rank(person: RecipientOut): number {
  if (person.unreachable) return 1;
  if (!person.invited) return 2;
  return person.answered ? 3 : 0;
}

function PersonStatus({ person, live }: { person: RecipientOut; live: boolean }) {
  if (person.unreachable) return <StatusChip status="danger">Could not reach</StatusChip>;
  if (!person.invited) return <StatusChip status="closed">Not sent</StatusChip>;
  if (person.answered === null) return null;
  if (person.answered) return <StatusChip status="answered">Answered</StatusChip>;
  if (!live) return <span className="text-muted text-sm">Did not answer</span>;
  return <StatusChip status="waiting">Waiting</StatusChip>;
}

function ReminderLine({ people, now }: { people: RecipientsOut; now: Date }) {
  const waiting =
    people.waitingCount === 1
      ? "1 person is waiting"
      : `${count(people.waitingCount)} people are waiting`;
  const available = people.reminderAvailableAt ? new Date(people.reminderAvailableAt) : null;
  if (available && available > now) {
    return (
      <>
        {waiting}. You can send the next reminder {momentLabel(available.toISOString(), now)}.
      </>
    );
  }
  if (people.nextReminderAt) {
    return (
      <>
        {waiting}. Holler reminds them {momentLabel(people.nextReminderAt, now)}.
      </>
    );
  }
  return <>{waiting}. Holler has sent every reminder it will.</>;
}

export { HollerPeople };
