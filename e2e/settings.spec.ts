import { expectAccessible, signInAs } from "./a11y";
import { expect, test } from "./fixtures";

// Role changes touch the shared dev workspace, so this file's tests run one at a time, and the
// tests that change or read roles run in one browser project only.
test.describe.configure({ mode: "serial" });
const rolesProjectOnly = () =>
  test.skip(test.info().project.name !== "chromium", "Roles are shared across projects");

test("a lead opens Settings from the header and sees the workspace and its members", async ({
  page,
}) => {
  await signInAs(page, "lead");
  await page.getByRole("button", { name: /, account$/ }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  await expect(page.getByText("Northwind", { exact: true })).toBeVisible();
  await expect(page.getByText("Installed", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByText("Tom Okafor")).toBeVisible();
  await expectAccessible(page);
});

test("an owner makes a sender an owner and back, and cannot leave the workspace without one", async ({
  page,
}) => {
  rolesProjectOnly();
  await signInAs(page, "lead", "/settings");
  const tom = page.getByRole("combobox", { name: "Role for Tom Okafor" });
  const mira = page.getByRole("combobox", { name: "Role for Mira Kask" });

  await expect(mira.locator("option[value=sender]")).toBeDisabled();
  await expect(page.getByText("You are the only owner.", { exact: false })).toBeVisible();

  await tom.selectOption("owner");
  await expect(mira.locator("option[value=sender]")).toBeEnabled();
  await expect(tom).toHaveValue("owner");

  await tom.selectOption("sender");
  await expect(tom).toHaveValue("sender");
  await expect(mira.locator("option[value=sender]")).toBeDisabled();
  await expectAccessible(page);
});

test("a sender sees the roles but cannot change them", async ({ page }) => {
  rolesProjectOnly();
  await signInAs(page, "sender", "/settings");
  await expect(page.getByText("Mira Kask")).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Role for/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Reinstall" })).toHaveCount(0);
  await expectAccessible(page);
});

test("someone signed out can add Holler to Slack", async ({ page }) => {
  await page.goto("/install");
  await expect(page.getByRole("heading", { name: "Add Holler to Slack" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add to Slack" })).toHaveAttribute(
    "href",
    "/slack/oauth/install",
  );
  await expectAccessible(page);
});

test("a cancelled install says nothing was installed", async ({ page }) => {
  await page.goto("/install?problem=denied");
  await expect(page.getByRole("alert")).toContainText("nothing was installed");
  await expectAccessible(page);
});
