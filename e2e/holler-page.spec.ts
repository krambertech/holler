import { expectAccessible, signInAs } from "./a11y";
import { expect, test } from "./fixtures";

test("a lead sees who is waiting, when Holler reminds them, and the results", async ({ page }) => {
  await signInAs(page, "lead");
  await page
    .getByRole("region", { name: /^Live \d+$/ })
    .getByRole("link", { name: "How was your week?" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "How was your week?" })).toBeVisible();
  const people = page.getByRole("region", { name: /^\d+ of \d+ answered$/ });
  await expect(people).toBeVisible();
  await expect(people.getByRole("listitem").first()).toContainText("Waiting");
  await expect(people.getByRole("button", { name: "Send reminder" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Results" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Anything in your way?" })).toBeVisible();
  await expectAccessible(page);
});

test("the people plate shows who to chase and opens to everyone", async ({ page }) => {
  await signInAs(page, "lead");
  await page
    .getByRole("region", { name: /^Live \d+$/ })
    .getByRole("link", { name: "Offsite: which dates work?" })
    .click();
  const people = page.getByRole("region", { name: /^\d+ of \d+ answered$/ });
  const rows = people.getByRole("listitem");
  await expect(rows.first()).toContainText("Waiting");
  await expect(people.getByText("Answered", { exact: true })).toHaveCount(0);
  await people.getByRole("button", { name: "Show everyone" }).click();
  await expect(people.getByText("Answered", { exact: true }).first()).toBeVisible();
  await expect(people.getByRole("button", { name: "Show fewer" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expectAccessible(page);
});

test("Close now asks first and can be put off", async ({ page }) => {
  await signInAs(page, "lead");
  await page
    .getByRole("region", { name: /^Live \d+$/ })
    .getByRole("link", { name: "Offsite: which dates work?" })
    .click();
  await page.getByRole("button", { name: "More for this Holler" }).click();
  await expect(page.getByRole("menuitem", { name: "Copy into a new draft" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Close now" }).click();
  const dialog = page.getByRole("dialog", { name: "Close this Holler?" });
  await expect(dialog).toBeVisible();
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Keep it open" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();
});

test("Export downloads every response as CSV", async ({ page }) => {
  await signInAs(page, "lead");
  await page
    .getByRole("region", { name: /^Live \d+$/ })
    .getByRole("link", { name: "Offsite: which dates work?" })
    .click();
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("menuitem", { name: "Copy as Markdown" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^holler-hol_.+\.csv$/);
});

test("Copy into a new draft opens the copy in the editor", async ({ page }) => {
  await signInAs(page, "lead");
  const live = page.getByRole("region", { name: /^Live \d+$/ });
  await live.getByRole("link", { name: "Offsite: which dates work?" }).click();
  await page.getByRole("button", { name: "More for this Holler" }).click();
  await page.getByRole("menuitem", { name: "Copy into a new draft" }).click();
  await expect(page).toHaveURL(/\/new\?draft=hol_/);
  await expect(page.getByText("Copied into a new draft.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(/Offsite/);
});

test("Send reminder wakes up when the wait between reminders ends", async ({ page }) => {
  await page.clock.install();
  await page.route("**/api/hollers/*/people", async (route) => {
    const response = await route.fetch();
    const people = await response.json();
    await route.fulfill({
      response,
      json: { ...people, reminderAvailableAt: new Date(Date.now() + 60_000).toISOString() },
    });
  });
  await signInAs(page, "lead");
  await page
    .getByRole("region", { name: /^Live \d+$/ })
    .getByRole("link", { name: "How was your week?" })
    .click();
  const remind = page.getByRole("button", { name: "Send reminder" });
  await expect(remind).toBeDisabled();
  await page.clock.fastForward("01:05");
  await expect(remind).toBeEnabled();
});

test("a repeating pulse shows its rounds from any round, and Stop repeating asks first", async ({
  page,
}) => {
  await signInAs(page, "lead");
  await page
    .getByRole("region", { name: /^Live \d+$/ })
    .getByRole("link", { name: "How was your week?" })
    .click();
  const rounds = page.getByRole("region", { name: "Rounds" });
  await expect(rounds).toContainText("A new round goes out every week.");
  await expect(rounds.getByRole("listitem")).toHaveCount(3);
  await expect(rounds.getByText("This round")).toBeVisible();
  await expect(rounds.getByText("Next round")).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "More for this Holler" }).click();
  await page.getByRole("menuitem", { name: "Stop repeating" }).click();
  const dialog = page.getByRole("dialog", { name: "Stop repeating this pulse?" });
  await expect(dialog).toContainText("Every round so far and its answers stay.");
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Keep repeating" }).click();
  await expect(dialog).toBeHidden();

  const first = rounds.getByRole("link").filter({ hasText: "Closed" });
  const firstId = (await first.getAttribute("href"))?.split("/").at(-1) ?? "";
  await page.route(`**/api/hollers/${firstId}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), repeat: null } });
  });
  await first.click();
  await expect(page.getByRole("heading", { level: 1, name: "How was your week?" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Rounds" }).getByText("This round")).toBeVisible();
});
