import { expect, test } from "@playwright/test";
import { expectAccessible, signInAs } from "./a11y";

test("the creator shares the results with someone and makes a report link", async ({ page }) => {
  await signInAs(page, "lead");
  await page
    .getByRole("region", { name: /^Live \d+$/ })
    .getByRole("link", { name: "How was your week?" })
    .click();
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share results" });
  await expect(dialog.getByRole("radio", { name: "You and the people you add" })).toBeChecked();
  await expectAccessible(page);

  await dialog.getByRole("combobox").first().click();
  const person = page.getByRole("option").filter({ hasNotText: "Already shared" }).first();
  const name = (await person.innerText()).trim().split("\n").at(-1)!;
  await person.click();
  const shared = dialog.getByRole("list", { name: "Shared with" });
  await expect(
    shared.getByRole("button", { name: `Stop sharing with ${name}`, exact: true }),
  ).toBeVisible();

  const link = dialog.getByRole("textbox", { name: "Report link" });
  if (!(await link.isVisible()))
    await dialog.getByRole("button", { name: "Make a report link" }).click();
  await expect(link).toHaveValue(/\/report\/[A-Za-z0-9_-]{43}$/);
  await expectAccessible(page);
});

test("a report link opens the results for anyone, and a wrong one says so", async ({
  page,
  browser,
}) => {
  await signInAs(page, "lead");
  const state = await (await page.request.get("/api/dev/state")).json();
  const holler = state.hollers.find(
    (h: { title: string }) => h.title === "Offsite: which dates work?",
  );
  const made = await page.request.post(`/api/hollers/${holler.id}/report-link`);
  expect(made.ok()).toBe(true);
  const { reportUrl } = (await made.json()) as { reportUrl: string };
  const here = new URL(page.url()).origin;
  const path = `${here}${new URL(reportUrl).pathname}`;

  const outside = await browser.newContext();
  const stranger = await outside.newPage();
  await stranger.goto(path);
  await expect(
    stranger.getByRole("heading", { level: 1, name: "Offsite: which dates work?" }),
  ).toBeVisible();
  await expect(stranger.getByText("It shows what people answered and never who.")).toBeVisible();
  await expectAccessible(stranger);

  await stranger.goto(`${here}/report/${"x".repeat(43)}`);
  await expect(stranger.getByText("This report is not available")).toBeVisible();
  await expectAccessible(stranger);
  await outside.close();
});
