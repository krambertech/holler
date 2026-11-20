import { expect, test } from "@playwright/test";
import { expectAccessible, signInAs } from "./a11y";

test("a lead sees live, scheduled and closed hollers with their counts", async ({ page }) => {
  await signInAs(page, "lead");
  await expect(page.getByRole("heading", { name: "Your hollers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Live/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Scheduled/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Closed/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Offsite: which dates work?" })).toBeVisible();
  await expect(page.getByText(/people still to answer\.$/)).toBeVisible();
  await expectAccessible(page);
});

test("a lead opens a Holler and reads its results", async ({ page }) => {
  await signInAs(page, "lead");
  await page.getByRole("link", { name: "Offsite: which dates work?" }).click();
  await expect(page.getByRole("heading", { name: "Offsite: which dates work?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where would you rather go?" })).toBeVisible();
  await expectAccessible(page);
});

test("a new sender sees how to start", async ({ page }) => {
  await signInAs(page, "sender");
  await expect(page.getByRole("heading", { name: "Ask your team something" })).toBeVisible();
  await expectAccessible(page);
});

test("someone signed out lands on Sign in with Slack", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("button", { name: "Sign in with Slack" })).toBeVisible();
  await expectAccessible(page);
});
