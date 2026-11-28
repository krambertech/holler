export const title = "Make an API key";
export const persona = "lead";
export const start = "/settings";

export default async function drive({ page, step, expect }) {
  const keys = page.getByRole("region", { name: "API keys" });
  const access = page
    .getByRole("region", { name: "API keys", includeHidden: true })
    .getByRole("combobox", { name: "Access", includeHidden: true });

  await step("Open Settings with no API keys", async () => {
    await expect(keys.getByText("You have no API keys.", { exact: false })).toBeVisible();
  });

  await step("Open Access, and the box names the list it opened", async () => {
    await access.click();
    const list = page.getByRole("listbox", { name: "Access" });
    await expect(list).toBeVisible();
    await expect(access).toHaveAttribute("aria-expanded", "true");
    const controls = await access.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    await expect(list).toHaveAttribute("id", controls);
    return { controls };
  });

  await step("Choose read and write access", async () => {
    await page.getByRole("option", { name: "Read and write" }).click();
    await expect(access).toHaveText(/Read and write/);
    await expect(access).toHaveAttribute("aria-expanded", "false");
  });

  await step("Name the key and make it", async () => {
    await keys.getByRole("textbox", { name: "Name" }).fill("Verify script");
    await keys.getByRole("button", { name: "Make key" }).click();
    await expect(keys.getByText("Verify script").first()).toBeVisible();
  });

  await step("The key is still listed after a reload, with read and write access", async () => {
    await page.reload();
    await expect(keys.getByText("Verify script").first()).toBeVisible();
    await expect(keys.getByText("Read and write").first()).toBeVisible();
    await expect(keys.getByText("You have no API keys.", { exact: false })).toHaveCount(0);
  });
}
