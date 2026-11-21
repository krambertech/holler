import type { OwnHoller } from "@holler/core";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ExternalLink } from "lucide-react";
import type { ComponentProps } from "react";
import { ModeGlyph } from "@/components/mode-glyph";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PlateRow } from "@/components/ui/plate";
import { cn } from "@/lib/cn";
import { closesLabel, shortDate } from "@/lib/format";

interface Props extends ComponentProps<typeof PlateRow> {
  holler: OwnHoller;
}

function rowLine(holler: OwnHoller): string {
  const from = `From ${holler.senderName}`;
  if (holler.state === "answered" && holler.answeredAt) {
    return `${from} · Answered ${shortDate(holler.answeredAt)}`;
  }
  if (holler.state === "missed") {
    const closed = holler.closedAt ?? holler.closesAt;
    return closed ? `${from} · Closed ${shortDate(closed)}` : from;
  }
  return holler.closesAt ? `${from} · Closes ${closesLabel(holler.closesAt)}` : from;
}

function OwnHollerRow({ holler, className, ...props }: Props) {
  const opens = holler.state === "answered";
  const title = holler.title || "Untitled";
  return (
    <PlateRow
      data-slot="own-holler-row"
      className={cn(
        "relative",
        opens &&
          "transition-colors hoverable:hover:bg-hover has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-focus has-[a:focus-visible]:-outline-offset-2",
        className,
      )}
      {...props}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-5 py-[13px]">
        <ModeGlyph mode={holler.mode} quiet={holler.state !== "waiting"} />
        <span className="min-w-0 flex-1 basis-48">
          {opens ? (
            <Link
              to="/answers/$id"
              params={{ id: holler.id }}
              className="block truncate font-normal text-base outline-none after:absolute after:inset-0 after:content-['']"
            >
              {title}
            </Link>
          ) : (
            <span
              className={cn(
                "block truncate font-normal text-base",
                holler.state === "missed" && "text-muted",
              )}
            >
              {title}
            </span>
          )}
          <span className="block truncate text-sm text-muted">{rowLine(holler)}</span>
        </span>
        {holler.anonymous && (
          <Chip variant="tint" className="max-sm:hidden">
            Anonymous
          </Chip>
        )}
        {holler.state === "waiting" && holler.slackUrl && (
          <Button
            size="sm"
            className="max-sm:ms-[46px]"
            render={<a href={holler.slackUrl} target="_blank" rel="noreferrer" />}
          >
            Answer in Slack
            <span className="sr-only">: {title}</span>
            <ExternalLink aria-hidden strokeWidth={2} />
          </Button>
        )}
        {opens && <ChevronRight aria-hidden size={18} strokeWidth={2} className="text-muted" />}
      </div>
    </PlateRow>
  );
}

export { OwnHollerRow };
