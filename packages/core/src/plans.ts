export const plans = {
  free: {
    label: "Free",
    monthlyHollers: 5,
    exports: true,
    api: true,
    mcp: true,
  },
  team: {
    label: "Team",
    monthlyHollers: Number.POSITIVE_INFINITY,
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

export function monthStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

export function nextMonthStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}

export function remainingThisMonth({ plan, sentThisMonth }: MonthlyUsage): number {
  return Math.max(0, plans[plan].monthlyHollers - sentThisMonth);
}

export function canSend(usage: MonthlyUsage): boolean {
  return remainingThisMonth(usage) > 0;
}
