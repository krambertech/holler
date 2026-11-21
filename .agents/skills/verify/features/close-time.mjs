export const title = "A holler closes at its close time";
export const persona = "lead";

const TITLE = "Offsite: which dates work?";

export default async function drive({ page, step, api, post, expect }) {
  const { hollers } = await api("/api/dev/state");
  const offsite = hollers.find((h) => h.title === TITLE);
  const live = hollers.filter((h) => h.status === "live").length;
  const closed = hollers.filter((h) => h.status === "closed").length;

  await step("The offsite survey is live on Home", async () => {
    await expect(
      page.getByRole("region", { name: `Live ${live}` }).getByRole("link", { name: TITLE }),
    ).toBeVisible();
    expect(offsite.status).toBe("live");
    return offsite;
  });

  await step("The cron runs a minute after its close time", async () => {
    const at = new Date(new Date(offsite.closesAt).getTime() + 60_000).toISOString();
    const tick = await post("/api/dev/tick", { at });
    expect(tick.closed).toContain(offsite.id);
    const state = await api("/api/dev/state");
    expect(state.hollers.find((h) => h.id === offsite.id).status).toBe("closed");
    expect(state.activity).toContainEqual(
      expect.objectContaining({ action: "holler.closed", via: "system", subjectId: offsite.id }),
    );
    return tick;
  });

  await step("Home moves it from Live to Closed", async () => {
    await page.reload();
    await expect(page.getByRole("region", { name: `Live ${live - 1}` })).toBeVisible();
    await expect(
      page.getByRole("region", { name: `Closed ${closed + 1}` }).getByRole("link", { name: TITLE }),
    ).toBeVisible();
  });

  await step("Its page says it is closed", async () => {
    await page.getByRole("link", { name: TITLE }).click();
    await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
  });
}
