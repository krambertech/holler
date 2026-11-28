import { StatusDot } from "@/components/ui/chip";
import { count, peopleLabel } from "@/lib/format";
import {
  clockTime,
  type Landing,
  landingTimes,
  type Reach,
  weekday,
  type ZoneCount,
  zoneName,
} from "./send-logic";

const SHOWN_ZONES = 8;

interface Props {
  sendAt: Date;
  inRecipientTimeZone: boolean;
  senderZone: string;
  zones: ZoneCount[];
  reach: Reach;
  now: Date;
}

function flagFor(row: Landing): string | null {
  if (row.passed) return "already past there, so it goes as soon as it sends";
  if (row.outsideWorkday) return "outside their working day";
  return null;
}

function LandingRow({
  row,
  inRecipientTimeZone,
  senderZone,
  sendDay,
}: {
  row: Landing;
  inRecipientTimeZone: boolean;
  senderZone: string;
  sendDay: string;
}) {
  const yours = { timeZone: senderZone };
  const time = inRecipientTimeZone
    ? clockTime(row.at, yours)
    : clockTime(row.at, { timeZone: row.zone });
  const otherDay = inRecipientTimeZone && weekday(row.at, yours) !== sendDay;
  const flag = flagFor(row);
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
      <span className="text-ink tabular">
        {otherDay ? `${weekday(row.at, yours)} ${time}` : time}
      </span>
      <span className="min-w-0 text-ink-2">
        {row.yours ? "Your time zone" : zoneName(row.zone)}
        <span className="text-muted">, {peopleLabel(row.people).toLocaleLowerCase()}</span>
      </span>
      {flag && (
        <span className="col-start-2 inline-flex items-center gap-1.5 text-ink-2 sm:col-start-auto">
          <StatusDot status="waiting" />
          {flag}
        </span>
      )}
    </li>
  );
}

function SendDialogLanding({ sendAt, inRecipientTimeZone, senderZone, zones, reach, now }: Props) {
  const rows = landingTimes({ sendAt, inRecipientTimeZone, senderZone, zones, now });
  const inGroups = reach.everyone || !reach.exact;
  if (rows.length === 0 && !inGroups) return null;
  const yours = { timeZone: senderZone };
  const sendDay = weekday(sendAt, yours);
  const shown = rows.slice(0, SHOWN_ZONES);
  const more = rows.length - shown.length;
  const noZone = zones.some((z) => !z.zone);
  return (
    <div
      data-slot="send-dialog-landing"
      className="grid gap-2 rounded-md bg-well px-3.5 py-3 text-sm"
    >
      {rows.length > 0 && (
        <>
          <p className="text-ink-2">
            {inRecipientTimeZone
              ? `Each person gets it at ${clockTime(sendAt, yours)} on their own clock. On yours:`
              : "Everyone gets it at once. On their clocks:"}
          </p>
          <ul className="grid gap-1">
            {shown.map((row) => (
              <LandingRow
                key={row.zone}
                row={row}
                inRecipientTimeZone={inRecipientTimeZone}
                senderZone={senderZone}
                sendDay={sendDay}
              />
            ))}
          </ul>
          {more > 0 && (
            <p className="text-muted">
              {more === 1 ? "And 1 more time zone." : `And ${count(more)} more time zones.`}
            </p>
          )}
        </>
      )}
      {inGroups && (
        <p className="text-muted">
          {inRecipientTimeZone
            ? "People in groups and channels get it by their own clock too."
            : "People in groups and channels get it at the same moment."}
        </p>
      )}
      {inRecipientTimeZone && noZone && (
        <p className="text-muted">
          Anyone with no time zone in Slack gets it at {clockTime(sendAt, yours)} UTC.
        </p>
      )}
    </div>
  );
}

export { SendDialogLanding };
