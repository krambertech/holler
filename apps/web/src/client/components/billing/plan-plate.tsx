import { type BillingOverview, plans } from "@holler/core";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { Plate, PlateRow, PlateStrip } from "@/components/ui/plate";
import { ProgressBar } from "@/components/ui/progress";
import { count } from "@/lib/format";
import { endDay, ownersToAsk, resetDay, useBillingRedirect } from "./billing-queries";

const plural = new Intl.PluralRules("en");

interface Props extends ComponentProps<typeof Plate> {
  overview: BillingOverview;
}

/**
 * The workspace's plan, this month's sends, and what an owner can do about it. A sender sees the
 * same numbers and who to ask, with no buttons.
 */
function PlanPlate({ overview, ...props }: Props) {
  const checkout = useBillingRedirect("checkout");
  const portal = useBillingRedirect("portal");
  const failed = checkout.error ?? portal.error;

  return (
    <Plate data-slot="plan-plate" {...props}>
      <PlateRow className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-lg">{plans[overview.plan].label}</h3>
          <p className="text-ink-2">{planLine(overview)}</p>
        </div>
        {overview.planEndsAt && (
          <StatusChip status="waiting">Ends {endDay(overview.planEndsAt)}</StatusChip>
        )}
      </PlateRow>

      <PlateRow className="flex flex-col gap-2.5 px-5 py-4">
        <UsageLine overview={overview} />
      </PlateRow>

      {failed && (
        <PlateRow className="px-5 py-3">
          <p role="alert" className="text-danger-ink text-sm">
            {failed.message}
          </p>
        </PlateRow>
      )}

      <PlateStrip className="py-3.5">
        <span className="max-w-[52ch]">{stripLine(overview)}</span>
        {overview.canManage && (
          <span className="flex flex-wrap gap-2">
            {overview.plan === "free" && (
              <Button
                variant="primary"
                size="sm"
                pending={checkout.isPending}
                disabled={portal.isPending}
                onClick={() => checkout.mutate()}
              >
                Upgrade to Team
              </Button>
            )}
            {overview.hasBillingAccount && (
              <Button
                size="sm"
                pending={portal.isPending}
                disabled={checkout.isPending}
                onClick={() => portal.mutate()}
              >
                Manage billing
              </Button>
            )}
          </span>
        )}
      </PlateStrip>
    </Plate>
  );
}

function UsageLine({ overview }: { overview: BillingOverview }) {
  const sent = count(overview.sentThisMonth);
  if (overview.monthlyLimit === null) {
    return (
      <p className="text-ink-2">
        <span className="tabular me-1.5 text-2xl text-ink">{sent}</span>
        {plural.select(overview.sentThisMonth) === "one"
          ? "Holler sent this month"
          : "hollers sent this month"}
      </p>
    );
  }
  const limit = count(overview.monthlyLimit);
  // A workspace that moved back to Free mid-month can have sent more than Free allows.
  const over = overview.sentThisMonth > overview.monthlyLimit;
  return (
    <>
      <p className="text-ink-2">
        <span className="tabular me-1.5 text-2xl text-ink">{sent}</span>
        {over
          ? `hollers sent this month. Free allows ${limit}.`
          : `of ${limit} hollers sent this month`}
      </p>
      <ProgressBar value={overview.sentThisMonth / overview.monthlyLimit} />
      <p className="text-muted text-sm">The count starts again on {resetDay(overview)}.</p>
    </>
  );
}

function planLine(overview: BillingOverview): string {
  if (overview.plan === "team") {
    return overview.planEndsAt
      ? "No monthly limit until the plan ends. Then the workspace moves to Free."
      : "No monthly limit. Billed to the workspace through Polar.";
  }
  const n = plans.free.monthlyHollers;
  return plural.select(n) === "one"
    ? `${count(n)} Holler a month for the whole workspace. Drafts are always free.`
    : `${count(n)} hollers a month for the whole workspace. Drafts are always free.`;
}

function stripLine(overview: BillingOverview): string {
  const atLimit = overview.monthlyLimit !== null && overview.sentThisMonth >= overview.monthlyLimit;
  if (!overview.canManage) {
    const owners = ownersToAsk(overview);
    return owners
      ? `Only owners change the plan. Ask ${owners}.`
      : "Only workspace owners change the plan.";
  }
  if (overview.plan === "team") {
    return overview.planEndsAt
      ? "Resume Team in billing to keep sending without a limit."
      : "Change the card, read invoices or cancel in billing.";
  }
  return atLimit
    ? `Sending stops until ${resetDay(overview)}. Team sends without a monthly limit.`
    : "Team sends without a monthly limit.";
}

export { PlanPlate };
