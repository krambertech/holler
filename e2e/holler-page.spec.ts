import { expect, test } from "@playwright/test";
import { expectAccessible, signInAs } from "./a11y";

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
