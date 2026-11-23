import { expectAccessible, signInAs } from "./a11y";
import { expect, test } from "./fixtures";

test("a lead makes an API key, uses it once, and revokes it", async ({ page, request }) => {
  const name = "Weekly export script";
  await signInAs(page, "lead", "/settings");
  await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connected apps" })).toBeVisible();
  await expect(page.getByText(/MCP server:/)).toBeVisible();

  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Access").click();
  await page.getByRole("option", { name: "Read and write" }).click();
  await expect(page.getByText("Can also create, edit, send and close hollers")).toBeVisible();
  await page.getByRole("button", { name: "Make key" }).click();

  await expect(page.getByText("Copy this key now. Holler cannot show it again.")).toBeVisible();
  const key = (await page.locator("code").filter({ hasText: /^hlr_/ }).textContent())?.trim();
  expect(key).toMatch(/^hlr_/);

  const me = await request.get("/api/v1/me", { headers: { authorization: `Bearer ${key}` } });
  expect(me.status()).toBe(200);
  expect((await me.json()).credential).toEqual({ via: "api", scope: "write" });

  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: `Revoke ${name}` }).click();
  await expect(page.getByText(`Revoke ${name}?`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.getByRole("button", { name: "Revoke key" }).click();
  await expect(page.getByText(name)).toHaveCount(0);

  const after = await request.get("/api/v1/me", { headers: { authorization: `Bearer ${key}` } });
  expect(after.status()).toBe(401);
  await expectAccessible(page);
});

test("an assistant asking for access shows what it may do, with write on by default", async ({
  page,
  request,
}) => {
  const registered = await request.post("/api/auth/oauth2/register", {
    data: {
      client_name: "Test assistant",
      application_type: "native",
      redirect_uris: ["http://127.0.0.1:9999/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "read write offline_access",
    },
  });
  expect(registered.ok()).toBe(true);
  const { client_id: clientId } = await registered.json();

  const consent = `/consent?${new URLSearchParams({ client_id: clientId, scope: "read write offline_access" })}`;
  await signInAs(page, "lead", consent);
  await expect(
    page.getByRole("heading", { name: "Allow Test assistant to use Holler?" }),
  ).toBeVisible();
  await expect(page.getByText("It acts as", { exact: false })).toContainText("Northwind");
  await expect(page.getByRole("checkbox", { name: /Make, edit and send hollers/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "Allow" })).toBeEnabled();
  await expectAccessible(page);
});
