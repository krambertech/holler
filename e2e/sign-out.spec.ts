import { expect, test } from "@playwright/test";
import { expectAccessible, signInAs } from "./a11y";

test("Sign out in the account menu ends the session", async ({ page }) => {
  await signInAs(page, "sender");
  await expect(page.getByRole("button", { name: /, account$/ })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: /, account$/ }).click();
  await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to Holler" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
});
