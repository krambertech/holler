import { expectAccessible, signInAs } from "./a11y";
import { expect, test } from "./fixtures";

test("an owner deletes the workspace's data only after typing its name", async ({ page }) => {
  await signInAs(page, "lead", "/settings");
  const section = page.getByRole("region", { name: "Workspace data" });
  await expect(section.getByText("Delete Northwind’s data")).toBeVisible();

  await section.getByRole("button", { name: "Delete data" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Northwind’s data?" });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Delete data" });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Type Northwind to confirm" }).fill("Northwin");
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Type Northwind to confirm" }).fill("Northwind");
  await expect(confirm).toBeEnabled();
  await expectAccessible(page);

  let sent: unknown;
  await page.route("**/api/settings/workspace", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await confirm.click();
  await expect(page).toHaveURL(/\/sign-in/);
  expect(sent).toEqual({ confirmName: "Northwind" });
  await expect(page.getByText("Northwind’s data is deleted")).toBeVisible();
  const session = await page.request.get("/api/auth/get-session");
  expect(await session.json(), "the browser that deleted is signed out").toBeNull();
  await expectAccessible(page);
});
