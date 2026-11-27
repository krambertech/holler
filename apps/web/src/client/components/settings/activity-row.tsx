import type { ActivityAction, ActivityEntry, ActivityVia } from "@holler/core";
import { Link } from "@tanstack/react-router";
import { Bot, Cog, KeyRound, MessageSquare } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { dayAndTime, peopleLabel } from "@/lib/format";
import { closingStop } from "@/lib/sentence";

const viaLabel: Record<ActivityVia, string> = {
  web: "On the web",
  slack: "In Slack",
  api: "Through the API",
  mcp: "Through a connected app",
  system: "By Holler",
};

function Name({ children }: { children: ReactNode }) {
  return <span className="text-ink">{children}</span>;
}

function HollerTitle({
  entry,
  last = false,
}: {
  entry: ActivityEntry;
  last?: boolean | undefined;
}) {
  if (!entry.subject.name) return <Name>a Holler that was deleted{last && "."}</Name>;
  if (!entry.subject.canOpen) {
    return (
      <>
        <Name>{entry.subject.name}</Name>
        {last && closingStop(entry.subject.name)}
      </>
    );
  }
  return (
    <>
      <Link
        to="/hollers/$id"
        params={{ id: entry.subject.id }}
        className="text-ink underline decoration-edge underline-offset-2 hoverable:hover:decoration-ink"
      >
        {entry.subject.name}
      </Link>
      {last && closingStop(entry.subject.name)}
    </>
  );
}

function who(entry: ActivityEntry): ReactNode {
  if (entry.actor) return <Name>{entry.actor.name}</Name>;
  return entry.via === "system" ? <Name>Holler</Name> : <Name>Someone</Name>;
}

const sentences: Record<ActivityAction, (entry: ActivityEntry) => ReactNode> = {
  "holler.created": (e) => (
    <>
      {who(e)} started the draft <HollerTitle entry={e} last />
    </>
  ),
  "holler.copied": (e) => (
    <>
      {who(e)} copied a Holler into the draft <HollerTitle entry={e} last />
    </>
  ),
  "holler.deleted": (e) => <>{who(e)} deleted a draft.</>,
  "holler.scheduled": (e) => (
    <>
      {who(e)} scheduled <HollerTitle entry={e} last />
    </>
  ),
  "holler.sent": (e) =>
    e.detail.count === undefined ? (
      <>
        {who(e)} sent <HollerTitle entry={e} last />
      </>
    ) : (
      <>
        {who(e)} sent <HollerTitle entry={e} /> to {peopleLabel(e.detail.count).toLowerCase()}.
      </>
    ),
  "holler.send_failed": (e) => (
    <>
      <HollerTitle entry={e} /> could not be sent.
    </>
  ),
  "holler.reminded": (e) =>
    e.detail.count === undefined ? (
      <>
        {who(e)} sent a reminder for <HollerTitle entry={e} last />
      </>
    ) : (
      <>
        {who(e)} reminded {peopleLabel(e.detail.count).toLowerCase()} about{" "}
        <HollerTitle entry={e} last />
      </>
    ),
  "holler.closed": (e) =>
    e.detail.reason === "creator" ? (
      <>
        {who(e)} closed <HollerTitle entry={e} last />
      </>
    ) : (
      <>
        <HollerTitle entry={e} /> closed at its close time.
      </>
    ),
  "holler.repeat_stopped": (e) => (
    <>
      {who(e)} stopped <HollerTitle entry={e} /> repeating.
    </>
  ),
  "holler.visibility_changed": (e) =>
    e.detail.to === "workspace" ? (
      <>
        {who(e)} shared the results of <HollerTitle entry={e} /> with everyone in the workspace.
      </>
    ) : (
      <>
        {who(e)} stopped sharing the results of <HollerTitle entry={e} /> with the workspace.
      </>
    ),
  "viewer.added": (e) =>
    e.detail.name ? (
      <>
        {who(e)} shared the results of <HollerTitle entry={e} /> with <Name>{e.detail.name}</Name>.
      </>
    ) : (
      <>
        {who(e)} shared the results of <HollerTitle entry={e} /> with one more person.
      </>
    ),
  "viewer.removed": (e) =>
    e.detail.name ? (
      <>
        {who(e)} stopped sharing the results of <HollerTitle entry={e} /> with{" "}
        <Name>{e.detail.name}</Name>.
      </>
    ) : (
      <>
        {who(e)} stopped sharing the results of <HollerTitle entry={e} /> with one person.
      </>
    ),
  "report_link.made": (e) => (
    <>
      {who(e)} made a report link for <HollerTitle entry={e} last />
    </>
  ),
  "report_link.turned_off": (e) => (
    <>
      {who(e)} turned off the report link for <HollerTitle entry={e} last />
    </>
  ),
  "reminder.snoozed": (e) => (
    <>
      Someone put off a reminder for <HollerTitle entry={e} last />
    </>
  ),
  "response.noted": (e) => (
    <>
      Someone added a note to their answer on <HollerTitle entry={e} last />
    </>
  ),
  "member.joined": (e) =>
    e.detail.role === "owner" ? <>{who(e)} joined as an owner.</> : <>{who(e)} joined Holler.</>,
  "member.role_changed": (e) => {
    const person = <Name>{e.subject.name ?? "someone who left"}</Name>;
    if (e.detail.reason === "reinstalled") {
      return <>{person} became an owner by adding Holler to Slack again.</>;
    }
    return e.detail.to === "owner" ? (
      <>
        {who(e)} made {person} an owner.
      </>
    ) : (
      <>
        {who(e)} made {person} a sender.
      </>
    );
  },
  "plan.changed": (e) =>
    e.detail.to === "team" ? (
      <>The workspace moved to the Team plan.</>
    ) : (
      <>The workspace moved to the Free plan.</>
    ),
  "api_key.created": (e) => (
    <>
      {who(e)} made the API key <Name>{e.subject.name ?? "without a name"}</Name>.
    </>
  ),
  "api_key.revoked": (e) => (
    <>
      {who(e)} revoked the API key <Name>{e.subject.name ?? "without a name"}</Name>.
    </>
  ),
  "connected_app.disconnected": (e) =>
    e.subject.name ? (
      <>
        {who(e)} disconnected <Name>{e.subject.name}</Name>.
      </>
    ) : (
      <>{who(e)} disconnected an app.</>
    ),
  "workspace.installed": (e) => <>{who(e)} added Holler to Slack.</>,
  "workspace.reinstalled": (e) => <>{who(e)} added Holler to Slack again.</>,
  "workspace.uninstalled": () => <>Holler was removed from Slack.</>,
};

function Mark({ entry }: { entry: ActivityEntry }) {
  if (entry.actor) {
    return (
      <Avatar name={entry.actor.name} seed={entry.actor.slackUserId} src={entry.actor.avatarUrl} />
    );
  }
  const Icon =
    entry.via === "slack"
      ? MessageSquare
      : entry.via === "api"
        ? KeyRound
        : entry.via === "mcp"
          ? Bot
          : Cog;
  return (
    <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-tint text-tint-ink">
      <Icon aria-hidden className="size-3.5" />
    </span>
  );
}

interface Props extends ComponentProps<"li"> {
  entry: ActivityEntry;
}

function ActivityRow({ entry, className, ...props }: Props) {
  return (
    <li
      data-slot="activity-row"
      className={cn(
        "flex items-start gap-3 border-divider border-t px-5 py-3 first:border-t-0",
        className,
      )}
      {...props}
    >
      <Mark entry={entry} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="text-ink-2">{sentences[entry.action](entry)}</p>
        <p className="text-muted text-sm">
          {viaLabel[entry.via]} · <time dateTime={entry.at}>{dayAndTime(entry.at)}</time>
        </p>
      </div>
    </li>
  );
}

export { ActivityRow };
