import { expectAccessible, signInAs } from "./a11y";
import { expect, test } from "./fixtures";

test("a lead types who to send to, adds by keyboard, and takes one out with Backspace", async ({
  page,
}) => {
  await signInAs(page, "lead");
  await expect(page.getByRole("heading", { name: "Your hollers" })).toBeVisible();
  await page.goto("/new?mode=pulse");
  await expect(page.getByRole("region", { name: "Audience" })).toBeVisible();

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

test("many people fold to one line away from the field, and open again on a click", async ({
  page,
}) => {
  await signInAs(page, "lead");
  await expect(page.getByRole("heading", { name: "Your hollers" })).toBeVisible();
  await page.goto("/new?mode=pulse");
  const picker = page.locator('[data-slot="audience-picker"]');
  const field = page.getByRole("combobox", { name: /people, groups or channels/ });
  const chips = page.getByRole("list", { name: "Chosen" }).getByRole("listitem");
  await field.click();
  const names: [string, RegExp][] = [
    ["tomas", /Tomás Ruiz/],
    ["amara", /Amara/],
    ["emma", /Emma/],
    ["oskar", /Oskar/],
    ["ilya", /Ilya/],
    ["jun", /Jun/],
    ["#gen", /general/],
  ];
  for (const [index, [typed, shown]] of names.entries()) {
    await field.pressSequentially(typed);
    await expect(page.getByRole("option").first()).toHaveAccessibleName(shown);
    await page.keyboard.press("Enter");
    await expect(chips).toHaveCount(index + 1);
  }
  await expect(picker).not.toHaveAttribute("data-collapsed");

  await page.getByRole("textbox", { name: "Title" }).click();
  await expect(picker).toHaveAttribute("data-collapsed", "true");
  await expect(page.locator('[data-slot="audience-more"]')).toHaveText(/^\+\d+ more$/);
  await expectAccessible(page);

  await page.locator('[data-slot="audience-more"]').click();
  await expect(field).toBeFocused();
  await expect(picker).not.toHaveAttribute("data-collapsed");
  await expect(page.locator('[data-slot="audience-more"]')).toHaveCount(0);
});
