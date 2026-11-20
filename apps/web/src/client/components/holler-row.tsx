import type { HollerSummary } from "@holler/core";
import { modeLabels } from "@holler/core";
import { Link } from "@tanstack/react-router";
import { closesLabel, shortDate } from "@/lib/format";
import { ModeGlyph } from "./mode-glyph";
import { AvatarStack } from "./ui/avatar";
import { Chip } from "./ui/chip";
import { PlateRow } from "./ui/plate";
import { ProgressBar } from "./ui/progress";

/**
 * One Holler on Home. Four columns on a wide screen (Holler, People, Answered, Closes); on a phone
 * the people and close time fold under the title and the answered count stays on the right.
 */
export function HollerRow({ holler }: { holler: HollerSummary }) {
  const quiet = holler.status !== "live";
  const subtitle = [
    modeLabels[holler.mode],
    holler.mode === "survey" ? `${holler.questionCount} questions` : null,
    holler.anonymous ? "anonymous" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PlateRow className="relative transition-colors hover:bg-hover">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-[13px] sm:grid-cols-[minmax(0,1fr)_92px_96px_96px]">
        <span className="flex min-w-0 items-center gap-3">
          <ModeGlyph mode={holler.mode} quiet={quiet} />
          <span className="min-w-0">
            <Link
              to="/hollers/$id"
              params={{ id: holler.id }}
              className={`block truncate font-normal text-md after:absolute after:inset-0 after:content-[''] focus-visible:outline-none ${quiet && holler.status === "closed" ? "text-muted" : ""}`}
            >
              {holler.title || "Untitled"}
            </Link>
            <span className="block truncate text-sm text-muted">{subtitle}</span>
          </span>
        </span>

        <span className="hidden sm:flex">
          {holler.status === "live" ? (
            <AvatarStack
              people={holler.people}
              total={holler.recipientCount}
              label={`${holler.recipientCount} people`}
            />
          ) : (
            <span className="text-sm text-muted">{holler.recipientCount || "No"} people</span>
          )}
        </span>

        <span className="text-end sm:text-start">
          {holler.status === "scheduled" ? (
            <span className="text-sm text-muted">Not sent</span>
          ) : (
            <>
              <span className="tabular font-normal">{holler.answeredCount}</span>
              <span className="tabular text-muted"> of {holler.recipientCount}</span>
              {holler.status === "live" && (
                <ProgressBar
                  className="mt-[5px] w-20 sm:w-auto"
                  value={holler.recipientCount ? holler.answeredCount / holler.recipientCount : 0}
                />
              )}
            </>
          )}
        </span>

        <span className="col-span-2 ps-[50px] text-sm text-muted sm:col-span-1 sm:ps-0">
          {holler.status === "scheduled" && holler.sendAt ? (
            <Chip tone="tint">{closesLabel(holler.sendAt)}</Chip>
          ) : holler.status === "closed" && holler.closedAt ? (
            <>
              <span className="sm:hidden">Closed </span>
              {shortDate(holler.closedAt)}
            </>
          ) : holler.closesAt ? (
            <>
              <span className="sm:hidden">Closes </span>
              {closesLabel(holler.closesAt)}
            </>
          ) : null}
        </span>
      </div>
    </PlateRow>
  );
}
