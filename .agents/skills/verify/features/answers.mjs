export const title = "Your answers";
export const persona = "lead";

export default async function drive({ page, step, expect }) {
  await step("Switch to Tom, who was sent the lead's hollers", async () => {
    await page.goto("/api/dev/sign-in?as=sender&to=/");
    await page.getByRole("button", { name: /, account$/ }).click();
    await page.getByRole("menuitem", { name: "Your answers" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your answers" })).toBeVisible();
  });

  await step("See every Holler sent to Tom, grouped by where it stands", async () => {
    for (const group of ["Waiting on you", "Answered", "Closed before you answered"]) {
      await expect(page.getByRole("region", { name: new RegExp(`^${group} \\d+$`) })).toBeVisible();
    }
    await expect(
      page.getByRole("link", { name: /^Answer in Slack\W+How was your week\?$/ }),
    ).toHaveAttribute("href", /^https:\/\/slack\.com\/app_redirect\?team=/);
  });

  await step("Open a named Holler's answers", async () => {
    await page.getByRole("link", { name: "Offsite: which dates work?" }).click();
    await expect(page.getByText("Which weeks could you travel?")).toBeVisible();
    await expect(page.getByText(/^Answered /)).toBeVisible();
    await page.getByRole("link", { name: "Your answers" }).last().click();
  });

  await step("Open an anonymous Holler's answers, which only Tom can see", async () => {
    await page.getByRole("link", { name: "Team health check" }).click();
    await expect(page.getByText("Only you can see which answers are yours.")).toBeVisible();
    await expect(page.getByText("How sustainable is your workload?")).toBeVisible();
  });
}
