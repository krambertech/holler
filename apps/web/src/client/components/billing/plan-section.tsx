import { useQuery } from "@tanstack/react-query";
import { type ComponentProps, useState } from "react";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/skeleton";
import { Plate } from "@/components/ui/plate";
import { meQuery } from "@/lib/queries";
import { billingQuery } from "./billing-queries";
import { PlanPlate } from "./plan-plate";

/** How long the section keeps asking for the plan after a checkout, before it stops waiting. */
const CONFIRM_FOR_MS = 90_000;

/**
 * The Billing section of Settings, at `/settings#billing`. Every member sees the plan and this
 * month's sends; owners can upgrade and manage billing. It loads its own data and takes no props,
 * so Settings places it with one line.
 */
function PlanSection(props: Omit<ComponentProps<"section">, "children">) {
  const me = useQuery(meQuery);
  // Polar sends an owner back to /settings?checkout=<id>#billing. Read once, outside the router,
  // so the Settings route's search schema need not know about it.
  const [returnedFromCheckout] = useState(() =>
    new URLSearchParams(window.location.search).has("checkout"),
  );
  const [openedAt] = useState(() => Date.now());
  const billing = useQuery({
    ...billingQuery,
    // Polar's webhook usually lands a few seconds after the checkout sends the owner back.
    refetchInterval: (query) =>
      returnedFromCheckout &&
      query.state.data?.plan === "free" &&
      Date.now() - openedAt < CONFIRM_FOR_MS
        ? 3000
        : false,
  });

  return (
    <section
      id="billing"
      data-slot="plan-section"
      aria-labelledby="billing-heading"
      className="flex flex-col gap-3"
      {...props}
    >
      <div>
        <h2 id="billing-heading" className="text-lg">
          Billing
        </h2>
        <p className="mt-0.5 max-w-[60ch] text-ink-2">
          {me.data
            ? `The plan belongs to ${me.data.workspace.name} and covers every member in it.`
            : "The plan belongs to the workspace and covers every member in it."}
        </p>
      </div>

      {billing.isPending ? (
        <PlanSkeleton />
      ) : billing.isError ? (
        <ErrorState
          title="We could not load the plan"
          description={billing.error.message}
          onRetry={() => billing.refetch()}
          pending={billing.isRefetching}
        />
      ) : (
        <>
          {returnedFromCheckout && <CheckoutReturn onTeam={billing.data.plan === "team"} />}
          <PlanPlate overview={billing.data} />
          {billing.data.plan === "free" && (
            <p className="max-w-[64ch] text-muted text-sm">
              Team is one price per workspace, monthly or yearly, however many people are in it.
              Polar sells it, sends the invoices and handles VAT. Any owner can change or cancel it.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function CheckoutReturn({ onTeam }: { onTeam: boolean }) {
  return (
    <Plate role="status" className="px-5 py-4">
      {onTeam ? (
        <p className="text-ink">Team is on. Send as many hollers as the team needs.</p>
      ) : (
        <p className="text-ink-2">
          Payment received. Team turns on when Polar confirms it, usually within a minute.
        </p>
      )}
    </Plate>
  );
}

function PlanSkeleton() {
  return (
    <Plate aria-busy aria-label="Loading the plan">
      <div className="flex flex-col gap-2 px-5 py-4">
        <Skeleton className="h-4 w-24 rounded-full" />
        <Skeleton className="h-3.5 w-3/5 rounded-full" />
      </div>
      <div className="flex flex-col gap-3 border-divider border-t px-5 py-4">
        <Skeleton className="h-6 w-2/5 rounded-full" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
      <div className="h-[60px] bg-tint" />
    </Plate>
  );
}

export { PlanSection };
