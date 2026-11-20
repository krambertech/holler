/**
 * What each plan allows. The server enforces these and the web app shows them, from this one
 * file. The Free number and the Team price are not final; DECISIONS.md, Still open.
 */
export const plans = {
  free: {
    label: "Free",
    /** Hollers a workspace may send in one calendar month (UTC). Drafts never count. */
    monthlyHollers: 3,
    /** Most recipients one Holler may go to. */
    maxRecipients: 50,
    exports: true,
    api: true,
    mcp: true,
  },
  team: {
    label: "Team",
    monthlyHollers: Number.POSITIVE_INFINITY,
    maxRecipients: 2000,
    exports: true,
    api: true,
    mcp: true,
  },
} as const;

export type Plan = keyof typeof plans;

export interface MonthlyUsage {
  plan: Plan;
  sentThisMonth: number;
}

/** The first moment of the calendar month that `at` falls in, in UTC. */
export function monthStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

/** The first moment of the next calendar month, when the monthly limit resets. */
export function nextMonthStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}

/** How many more hollers the workspace may send this month. Infinity on Team. */
export function remainingThisMonth({ plan, sentThisMonth }: MonthlyUsage): number {
  return Math.max(0, plans[plan].monthlyHollers - sentThisMonth);
}

export function canSend(usage: MonthlyUsage): boolean {
  return remainingThisMonth(usage) > 0;
}
