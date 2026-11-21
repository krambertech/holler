import { expect, test } from "@playwright/test";
import { expectAccessible, signInAs } from "./a11y";

test("a lead types who to send to, adds by keyboard, and takes one out with Backspace", async ({
  page,
}) => {
  await signInAs(page, "lead");
  await expect(page.getByRole("heading", { name: "Your hollers" })).toBeVisible();
  await page.goto("/new?mode=pulse&stage=send");
  await expect(page.getByRole("heading", { name: "Who" })).toBeVisible();

  const field = page.getByRole("combobox", { name: /people, groups or channels/ });
  const chips = page.getByRole("list", { name: "Chosen" }).getByRole("listitem");
  const status = page.locator('[data-slot="audience-picker"] [role="status"].sr-only');
  await field.click();

  await field.pressSequentially("tomas");
  await expect(page.getByRole("option", { name: /Tomás Ruiz/ })).toBeVisible();
  await page
    .locator('[data-slot="audience-results"]')
    .evaluate((list) => Promise.all(list.getAnimations({ subtree: true }).map((a) => a.finished)));
  await expectAccessible(page);
  await page.keyboard.press("Enter");
  await expect(chips).toHaveText([/Tomás Ruiz/]);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("");
  await expect(status).toHaveText("Added Tomás Ruiz. 1 person.");

  await field.pressSequentially("@des");
  await expect(page.getByRole("option", { name: /@design/ })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(chips).toHaveText([/@design/, /Tomás Ruiz/]);
  await expect(field).toBeFocused();
  await expect(page.locator('[data-slot="audience-reach"]')).toHaveText("About 7 people");

  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: "Remove Tomás Ruiz" })).toBeFocused();
  await expect(chips).toHaveCount(2);
  await expectAccessible(page);
  await page.keyboard.press("Backspace");
  await expect(chips).toHaveText([/@design/]);
  await expect(field).toBeFocused();
  await expect(status).toHaveText("Removed Tomás Ruiz. About 6 people.");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(chips).toHaveText([/@design/, /Tomás Ruiz/]);

  await field.click();
  await field.pressSequentially("ka");
  await expect(page.getByRole("listbox", { name: "Matches" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Matches" })).toBeHidden();
  await field.fill("");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(chips).toHaveCount(2);
  await expect(page.locator('[data-slot="toast-close"]')).toHaveCount(0);
  await expectAccessible(page);
});
