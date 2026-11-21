export const title = "Make an API key";
export const persona = "lead";
export const start = "/settings";

export default async function drive({ page, step, expect }) {
  const keys = page.getByRole("region", { name: "API keys" });

  await step("Open Settings with no API keys", async () => {
    await expect(keys.getByText("You have no API keys.", { exact: false })).toBeVisible();
  });

  await step("Name a read-only key and make it", async () => {
    await keys.getByRole("textbox", { name: "Name" }).fill("Verify script");
    await keys.getByRole("button", { name: "Make key" }).click();
    await expect(keys.getByText("Verify script").first()).toBeVisible();
  });

  await step("The key is still listed after a reload", async () => {
    await page.reload();
    await expect(keys.getByText("Verify script").first()).toBeVisible();
    await expect(keys.getByText("You have no API keys.", { exact: false })).toHaveCount(0);
  });
}
