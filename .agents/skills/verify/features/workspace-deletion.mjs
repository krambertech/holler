export const title = "Delete the workspace's data";
export const persona = "lead";
export const start = "/settings";

export default async function drive({ page, step, api, expect }) {
  await step("Open Workspace data at the end of Settings", async () => {
    const section = page.getByRole("region", { name: "Workspace data" });
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByText("Delete Northwind’s data")).toBeVisible();
    await section.getByRole("button", { name: "Delete data" }).click();
    await expect(page.getByRole("dialog", { name: "Delete Northwind’s data?" })).toBeVisible();
  });

  await step("Delete data wakes up only for the workspace's full name", async () => {
    const dialog = page.getByRole("dialog");
    const field = dialog.getByRole("textbox", { name: "Type Northwind to confirm" });
    const confirm = dialog.getByRole("button", { name: "Delete data" });
    await expect(confirm).toBeDisabled();
    await field.fill("Northwin");
    await expect(confirm).toBeDisabled();
    await field.fill("Northwind");
    await expect(confirm).toBeEnabled();
  });

  await step("Delete it, and land on Sign in with the session ended", async () => {
    await page.getByRole("dialog").getByRole("button", { name: "Delete data" }).click();
    await expect(page.getByText("Northwind’s data is deleted")).toBeVisible();
    const session = await api("/api/auth/get-session");
    expect(session).toBeNull();
    return { session };
  });

  await step("Signing in again seeds a fresh Northwind", async () => {
    await page.goto("/api/dev/sign-in?as=lead&to=/");
    await expect(page.getByRole("heading", { level: 1, name: "Your hollers" })).toBeVisible();
  });
}
