import { describe, expect, it } from "vitest";
import { deletionDueAt, keptAfterUninstallDays, uninstalledBefore } from "./deletion";

describe("workspace deletion after an uninstall", () => {
  it("is due 90 days after Slack reported the uninstall", () => {
    expect(keptAfterUninstallDays).toBe(90);
    expect(deletionDueAt(new Date("2026-11-21T09:00:00Z")).toISOString()).toBe(
      "2027-02-19T09:00:00.000Z",
    );
  });

  it("finds a workspace due exactly when its deletion date arrives", () => {
    const uninstalledAt = new Date("2026-11-21T09:00:00Z");
    const due = deletionDueAt(uninstalledAt);
    expect(uninstalledBefore(due).getTime()).toBe(uninstalledAt.getTime());
    expect(uninstalledBefore(new Date(due.getTime() - 1)).getTime()).toBeLessThan(
      uninstalledAt.getTime(),
    );
  });
});
