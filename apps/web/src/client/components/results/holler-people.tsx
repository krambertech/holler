import type { RecipientOut, RecipientsOut } from "@holler/core";
import { type ComponentProps, type ReactNode, useState } from "react";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { Plate, PlateRow, Underplate, UnderplateStrip } from "@/components/ui/plate";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { count, momentLabel } from "@/lib/format";

const FOLDED = 8;

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
  now = new Date(),
  className,
  ...props
}: Props) {
  const [open, setOpen] = useState(false);
  const { recipientCount, answeredCount, waitingCount, recipients } = people;
  const ordered = anonymous ? recipients : [...recipients].sort((a, b) => rank(a) - rank(b));
  const shown = open ? ordered : ordered.slice(0, FOLDED);
  const share = recipientCount === 0 ? 0 : answeredCount / recipientCount;
  const reminderAt = people.reminderAvailableAt ? new Date(people.reminderAvailableAt) : null;
  const canRemindNow = canRemind && reminderAt !== null && reminderAt <= now;

  return (
    <section aria-labelledby="people-heading" data-slot="holler-people" {...props}>
      <Wrap
        className={className}
        strip={
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
                  Send reminder
                </Button>
              )}
            </UnderplateStrip>
          ) : null
        }
      >
        <Plate>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
            <div className="min-w-0 flex-1 basis-48">
              <h2 id="people-heading" className="text-lg tabular">
                {count(answeredCount)} of {count(recipientCount)} answered
              </h2>
              <ProgressBar value={share} className="mt-2" />
            </div>
            <AvatarStack
              people={recipients.slice(0, 6).map((r) => ({ ...r, answered: r.answered ?? true }))}
              total={recipientCount}
              aria-label={
                anonymous
                  ? `${count(recipientCount)} people`
                  : `${count(recipientCount)} people, ${count(answeredCount)} answered`
              }
            />
          </div>
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
                <PersonStatus person={person} />
              </li>
            ))}
          </ul>
          {recipients.length > FOLDED && (
            <PlateRow className="px-3 py-1.5">
              <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
                {open ? "Show fewer" : `Show everyone (${count(recipients.length)})`}
              </Button>
            </PlateRow>
          )}
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

function PersonStatus({ person }: { person: RecipientOut }) {
  if (person.unreachable) return <StatusChip status="danger">Could not reach</StatusChip>;
  if (!person.invited) return <StatusChip status="closed">Not sent</StatusChip>;
  if (person.answered === null) return null;
  return person.answered ? (
    <StatusChip status="answered">Answered</StatusChip>
  ) : (
    <StatusChip status="waiting">Waiting</StatusChip>
  );
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
