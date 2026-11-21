import type { BillingOverview, BillingRedirect } from "@holler/core";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const billingQuery = queryOptions({
  queryKey: ["billing"],
  queryFn: () => api<BillingOverview>("/billing"),
});

/**
 * Starts a Polar checkout or opens the Polar customer portal, then leaves for it. Polar brings the
 * owner back to `/settings#billing`. The mutation stays pending through the navigation, so the
 * button keeps its spinner until the page goes.
 */
export function useBillingRedirect(to: "checkout" | "portal") {
  return useMutation({
    mutationFn: async () => {
      const { url } = await api<BillingRedirect>(`/billing/${to}`, { method: "POST" });
      window.location.assign(url);
      await new Promise(() => {});
    },
  });
}

const utcDay = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "1 December": the monthly count restarts at midnight UTC, so the date is read in UTC. */
export function resetDay(overview: BillingOverview): string {
  return utcDay.format(new Date(overview.resetsAt));
}

/** "November": the month whose hollers are counted, the one before the reset. */
export function countedMonth(overview: BillingOverview): string {
  const lastDay = new Date(new Date(overview.resetsAt).getTime() - 1);
  return new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" }).format(lastDay);
}

/** "20 December": when a cancelled Team plan ends, in the reader's own time zone. */
export function endDay(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(
    new Date(iso),
  );
}

/** "Maya Chen or Tom Ruiz", or null when the reader is the only owner. */
export function ownersToAsk(overview: BillingOverview): string | null {
  if (overview.owners.length === 0) return null;
  return new Intl.ListFormat(undefined, { type: "disjunction" }).format(
    overview.owners.map((owner) => owner.name),
  );
}
