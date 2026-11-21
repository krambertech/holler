export const title = "Home";
export const persona = "lead";

const region = (page, name) => page.getByRole("region", { name: new RegExp(`^${name} \\d+$`) });

export default async function drive({ page, step, api, expect }) {
  await step("See the seeded hollers grouped by status", async () => {
    const { hollers } = await api("/api/dev/state");
    const count = (status) => hollers.filter((h) => h.status === status).length;
    await expect(region(page, "Live")).toHaveAccessibleName(`Live ${count("live")}`);
    await expect(region(page, "Scheduled")).toHaveAccessibleName(`Scheduled ${count("scheduled")}`);
    await expect(region(page, "Closed")).toHaveAccessibleName(`Closed ${count("closed")}`);
    return { live: count("live"), scheduled: count("scheduled"), closed: count("closed") };
  });

  await step("Each live holler shows its answered count from the stored recipients", async () => {
    const { hollers } = await api("/api/dev/state");
    const live = hollers.filter((h) => h.status === "live");
    for (const holler of live) {
      await expect(
        region(page, "Live").getByText(`${holler.answered} of ${holler.recipients}`, {
          exact: true,
        }),
      ).toBeVisible();
    }
    return live.map(({ title, recipients, answered }) => ({ title, recipients, answered }));
  });

  await step("Switch to Shared with me, which is empty for the lead", async () => {
    await page.getByRole("tab", { name: /^Shared with me/ }).click();
    await expect(page.getByRole("tab", { name: /^Shared with me/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
}
