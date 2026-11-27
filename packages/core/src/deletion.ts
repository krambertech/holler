export const keptAfterUninstallDays = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export function deletionDueAt(uninstalledAt: Date): Date {
  return new Date(uninstalledAt.getTime() + keptAfterUninstallDays * DAY_MS);
}

export function uninstalledBefore(now: Date): Date {
  return new Date(now.getTime() - keptAfterUninstallDays * DAY_MS);
}

export function teamRenews(workspace: { plan: string; planEndsAt: Date | null }): boolean {
  return workspace.plan === "team" && workspace.planEndsAt == null;
}
