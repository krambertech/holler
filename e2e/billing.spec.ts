import { expect, type Page, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

/** Signs in and lands on the Billing section in one navigation, so no redirect races the test. */
async function openBilling(page: Page, persona: "lead" | "sender") {
  await page.goto(`/api/dev/sign-in?as=${persona}&to=${encodeURIComponent("/settings#billing")}`);
  await page.waitForURL(/\/settings/);
}

function billingSection(page: Page) {
  return page.getByRole("region", { name: "Billing" });
}

test("an owner sees the plan, this month's sends and how to upgrade", async ({ page }) => {
  await openBilling(page, "lead");
  const billing = billingSection(page);
  await expect(billing.getByRole("heading", { name: "Free" })).toBeVisible();
  await expect(billing.getByText(/hollers sent this month/)).toBeVisible();
  await expect(billing.getByText(/The count starts again on/)).toBeVisible();
  await expect(billing.getByRole("button", { name: "Upgrade to Team" })).toBeVisible();
  await expectAccessible(page);
});

test("an owner is told plainly when billing is not set up", async ({ page }) => {
  await openBilling(page, "lead");
  const billing = billingSection(page);
  await billing.getByRole("button", { name: "Upgrade to Team" }).click();
  await expect(billing.getByRole("alert")).toHaveText(/Billing is not set up on this server yet/);
  await expectAccessible(page);
});

test("a sender sees the plan without buttons, and which owner to ask", async ({ page }) => {
  await openBilling(page, "sender");
  const billing = billingSection(page);
  await expect(billing.getByRole("heading", { name: "Free" })).toBeVisible();
  await expect(billing.getByText(/^Only owners change the plan\. Ask .+\.$/)).toBeVisible();
  await expect(billing.getByRole("button", { name: "Upgrade to Team" })).toHaveCount(0);
  await expect(billing.getByRole("button", { name: "Manage billing" })).toHaveCount(0);
  await expectAccessible(page);
});

test("billing reads at night", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openBilling(page, "lead");
  await expect(billingSection(page).getByRole("button", { name: "Upgrade to Team" })).toBeVisible();
  await expectAccessible(page);
});
