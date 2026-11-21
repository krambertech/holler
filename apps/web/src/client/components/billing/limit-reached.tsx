import type { BillingOverview } from "@holler/core";
import { useQuery } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { cn } from "@/lib/cn";
import {
  billingQuery,
  countedMonth,
  ownersToAsk,
  resetDay,
  useBillingRedirect,
} from "./billing-queries";

interface Props extends ComponentProps<typeof Plate> {
  /** The `402 limit_reached` message from the server, shown until the plan has loaded. */
  fallbackMessage?: string | undefined;
}

/**
 * What a send says when Free has used this month's hollers. Put it beside Send when a send returns
 * `402 limit_reached`. Owners can upgrade from here; senders learn which owner to ask. The draft is
 * untouched either way. Send keeps the screen's plum button, so this one is secondary.
 */
function LimitReached({ fallbackMessage, className, ...props }: Props) {
  const billing = useQuery(billingQuery);
  const overview = billing.data;

  if (!overview) {
    return (
      <Plate
        role="alert"
        data-slot="limit-reached"
        className={cn("px-5 py-4 text-ink-2", className)}
        {...props}
      >
        {fallbackMessage ??
          "This workspace sent this month's hollers on Free. Your draft is saved."}
      </Plate>
    );
  }
  if (overview.plan === "team") return null;
  return <LimitReachedMessage overview={overview} className={className} {...props} />;
}

interface MessageProps extends ComponentProps<typeof Plate> {
  overview: BillingOverview;
}

/** The message itself, for a plan already loaded. The design page shows it with sample plans. */
function LimitReachedMessage({ overview, className, ...props }: MessageProps) {
  return (
    <Plate
      role="alert"
      data-slot="limit-reached"
      className={cn(
        "flex flex-col items-start gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="flex max-w-[56ch] flex-col gap-1">
        <h2 className="font-normal text-ink">{limitTitle(overview)}</h2>
        <p className="text-ink-2">{limitBody(overview)}</p>
      </div>
      {overview.canManage ? <UpgradeButton /> : <SeePlans />}
    </Plate>
  );
}

function UpgradeButton() {
  const checkout = useBillingRedirect("checkout");
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button pending={checkout.isPending} onClick={() => checkout.mutate()}>
        Upgrade to Team
      </Button>
      {checkout.isError && (
        <p role="alert" className="text-danger-ink text-sm">
          {checkout.error.message}
        </p>
      )}
    </div>
  );
}

function SeePlans() {
  return (
    // A plain link: Settings is its own area's route, and #billing scrolls to this section there.
    <Button render={<a href="/settings#billing" />}>See plans</Button>
  );
}

function limitTitle(overview: BillingOverview): string {
  const n = overview.monthlyLimit ?? 0;
  const limit = new Intl.NumberFormat().format(n);
  const month = countedMonth(overview);
  if (new Intl.PluralRules("en").select(n) === "one") {
    return `This workspace sent its ${limit} Holler for ${month}`;
  }
  return `This workspace sent its ${limit} hollers for ${month}`;
}

function limitBody(overview: BillingOverview): string {
  const day = resetDay(overview);
  if (overview.canManage) {
    return `Upgrade to Team to send it now, or send it on ${day}. Your draft is saved.`;
  }
  const owners = ownersToAsk(overview);
  if (owners) {
    return `Ask ${owners} to upgrade to Team, or send it on ${day}. Your draft is saved.`;
  }
  return `Ask a workspace owner to upgrade to Team, or send it on ${day}. Your draft is saved.`;
}

export { LimitReached, LimitReachedMessage };
