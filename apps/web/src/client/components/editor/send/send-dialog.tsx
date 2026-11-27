import { useState } from "react";
import { LimitReached } from "@/components/billing/limit-reached";
import { Button } from "@/components/ui/button";
import { DateTimeInput } from "@/components/ui/date-time-input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DirectoryGroup, DirectorySearch } from "./directory";
import { fromPicker, toPicker, tomorrowMorning } from "./picker-time";
import { SendDialogLanding } from "./send-dialog-landing";
import { type SendContext, SendDialogRow, SendDialogRows } from "./send-dialog-rows";
import {
  type Reach,
  reachLabel,
  type SendFields,
  sendActionLabel,
  sendSummary,
  zoneName,
} from "./send-logic";

export type SendKind = "now" | "schedule";

export interface SendDialogProblems {
  sendAt?: string | undefined;
  closesAt?: string | undefined;
  failed?: string | undefined;
  limit?: string | undefined;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: SendKind;
  rescheduling?: boolean | undefined;
  title: string;
  value: SendFields;
  onConfirm: (fields: SendFields) => void;
  pending?: boolean | undefined;
  problems?: SendDialogProblems | undefined;
  reach: Reach;
  context: SendContext;
  knownChannels?: DirectoryGroup[] | undefined;
  search: DirectorySearch;
}

function whoLine(reach: Reach, anonymous: boolean): string {
  const who = reach.everyone ? "Everyone in the workspace" : reachLabel(reach);
  const answers = anonymous ? "anonymous answers" : "named answers";
  if (!reach.everyone && reach.unknown) return `Everyone you chose · ${answers}`;
  return `${who} · ${answers}`;
}

function startFields(kind: SendKind, value: SendFields, context: SendContext): SendFields {
  if (kind === "now") return { ...value, sendAt: null, sendInRecipientTimeZone: false };
  return { ...value, sendAt: value.sendAt ?? tomorrowMorning(context.now, context.senderZone) };
}

const zoneItems = (senderZone: string) => [
  { value: "theirs", label: "Each person’s own" },
  { value: "mine", label: `Yours, ${zoneName(senderZone)}` },
];

function ScheduleWhen({
  value,
  onChange,
  context,
  reach,
  problem,
}: {
  value: SendFields;
  onChange: (patch: Partial<SendFields>) => void;
  context: SendContext;
  reach: Reach;
  problem?: string | undefined;
}) {
  const { now, senderZone, zones } = context;
  if (!value.sendAt) return null;
  const when = sendSummary(value, context, problem);
  const items = zoneItems(senderZone);
  return (
    <div data-slot="send-dialog-when" className="grid gap-1">
      <DateTimeInput
        value={toPicker(value.sendAt, senderZone)}
        min={toPicker(now, senderZone)}
        onValueChange={(picked) => onChange({ sendAt: fromPicker(picked, senderZone) })}
        aria-invalid={when.tone === "danger" || undefined}
      />
      {when.tone === "danger" && <p className="text-danger-ink text-sm">{when.description}</p>}
      <SendDialogRow
        label="Time zone"
        description={
          value.sendInRecipientTimeZone
            ? "That time wherever each person is"
            : "That time where you are, for everyone"
        }
        control={(ids) => (
          <Select
            value={value.sendInRecipientTimeZone ? "theirs" : "mine"}
            items={items}
            onValueChange={(next) => onChange({ sendInRecipientTimeZone: next === "theirs" })}
          >
            <SelectTrigger aria-labelledby={ids.label} aria-describedby={ids.description}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent aria-label="Time zone">
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value} indicator="end">
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      >
        <SendDialogLanding
          sendAt={value.sendAt}
          inRecipientTimeZone={value.sendInRecipientTimeZone}
          senderZone={senderZone}
          zones={zones}
          reach={reach}
          now={now}
        />
      </SendDialogRow>
    </div>
  );
}

function SendDialogBody({
  kind,
  rescheduling = false,
  title,
  value,
  onConfirm,
  pending,
  problems = {},
  reach,
  context,
  knownChannels = [],
  search,
}: Omit<Props, "open" | "onOpenChange">) {
  const [fields, setFields] = useState(() => startFields(kind, value, context));
  const [counting, setCounting] = useState(Boolean(value.announceChannelId));
  const [channels, setChannels] = useState(
    () => new Map(knownChannels.map((c) => [c.slackId, c] as const)),
  );
  const [missingChannel, setMissingChannel] = useState(false);
  const change = (patch: Partial<SendFields>) => setFields((f) => ({ ...f, ...patch }));
  const channel = fields.announceChannelId
    ? (channels.get(fields.announceChannelId) ?? null)
    : null;
  const scheduling = kind === "schedule";
  const label = rescheduling ? "Update schedule" : sendActionLabel(reach, scheduling);

  const confirm = () => {
    if (counting && !fields.announceChannelId) {
      setMissingChannel(true);
      return;
    }
    onConfirm({ ...fields, announceChannelId: counting ? fields.announceChannelId : null });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{scheduling ? `Schedule “${title}”` : `Send “${title}”`}</DialogTitle>
        <DialogDescription>{whoLine(reach, value.anonymous)}</DialogDescription>
      </DialogHeader>
      {scheduling && (
        <ScheduleWhen
          value={fields}
          onChange={change}
          context={context}
          reach={reach}
          problem={problems.sendAt}
        />
      )}
      <SendDialogRows
        value={fields}
        onChange={change}
        context={context}
        closeProblem={problems.closesAt}
        counting={counting}
        onCounting={(on) => {
          setCounting(on);
          setMissingChannel(false);
        }}
        channel={channel}
        onChannel={(next) => {
          setChannels((previous) => new Map(previous).set(next.slackId, next));
          setMissingChannel(false);
          change({ announceChannelId: next.slackId });
        }}
        channelProblem={missingChannel ? "Pick a channel for the live count." : undefined}
        search={search}
      />
      {problems.limit != null && <LimitReached fallbackMessage={problems.limit} />}
      {problems.failed && <p className="text-danger-ink text-sm">{problems.failed}</p>}
      <p className="text-muted text-sm">
        {scheduling
          ? "You can change it until it sends."
          : "It goes out in Slack right away. A sent Holler cannot be called back."}
      </p>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost">Cancel</Button>} />
        <Button variant="primary" pending={pending} onClick={confirm}>
          {label}
        </Button>
      </DialogFooter>
    </>
  );
}

function SendDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-slot="send-dialog" size="md">
        <SendDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

export { SendDialog };
