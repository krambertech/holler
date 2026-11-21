export const title = "A repeating pulse shows its rounds and stops repeating";
export const persona = "lead";

const TITLE = "How was your week?";

export default async function drive({ page, step, api, expect }) {
  const state = await api("/api/dev/state");
  const pulse = state.hollers.find((h) => h.title === TITLE && h.status === "live");

  await step("Open the live pulse: its rounds sit side by side", async () => {
    await page
      .getByRole("region", { name: /^Live \d+$/ })
      .getByRole("link", { name: TITLE })
      .click();
    const series = await api(`/api/hollers/${pulse.id}/rounds`);
    const rounds = page.getByRole("region", { name: "Rounds" });
    await expect(rounds).toContainText("A new round goes out every week.");
    await expect(rounds.getByRole("listitem")).toHaveCount(series.rounds.length);
    await expect(rounds.getByText("This round")).toBeVisible();
    await expect(rounds.getByText("Next round")).toBeVisible();
    return { repeat: series.repeat, rounds: series.rounds.map((r) => [r.status, r.responseCount]) };
  });

  await step("Open the closed round from the list, then come back", async () => {
    const rounds = page.getByRole("region", { name: "Rounds" });
    await rounds.getByRole("link").filter({ hasText: "Closed" }).click();
    await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Rounds" }).getByText("This round"),
    ).toBeVisible();
    await page
      .getByRole("region", { name: "Rounds" })
      .getByRole("link")
      .filter({ hasText: "Live" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/hollers/${pulse.id}$`));
    return { back: pulse.id };
  });

  await step("Stop repeating asks once, then deletes only the next round", async () => {
    await page.getByRole("button", { name: "More for this Holler" }).click();
    await page.getByRole("menuitem", { name: "Stop repeating" }).click();
    const dialog = page.getByRole("dialog", { name: "Stop repeating this pulse?" });
    await expect(dialog).toContainText("Every round so far and its answers stay.");
    await dialog.getByRole("button", { name: "Stop repeating" }).click();
    await expect(page.getByText("This pulse no longer repeats. Every answer stays.")).toBeVisible();
    const rounds = page.getByRole("region", { name: "Rounds" });
    await expect(rounds).toContainText("This pulse no longer repeats.");
    const series = await api(`/api/hollers/${pulse.id}/rounds`);
    expect(series.repeat).toBeNull();
    expect(series.rounds.map((r) => r.status)).not.toContain("scheduled");
    const stored = await api("/api/dev/state");
    expect(stored.activity).toContainEqual(
      expect.objectContaining({ action: "holler.repeat_stopped", via: "web" }),
    );
    await page.getByRole("button", { name: "More for this Holler" }).click();
    await expect(page.getByRole("menuitem", { name: "Stop repeating" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    return { repeat: series.repeat, rounds: series.rounds.map((r) => r.status) };
  });
}
