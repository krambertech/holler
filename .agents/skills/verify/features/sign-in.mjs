export const title = "Sign in and sign out";
export const persona = "lead";

export default async function drive({ page, step, api, expect }) {
  await step("Land on Home as the lead persona", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "Your hollers" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Mira\b.*, account$/ })).toBeVisible();
    const state = await api("/api/dev/state");
    expect(state.persona).toBe("lead");
    expect(state.member.role).toBe("owner");
    return { persona: state.persona, member: state.member };
  });

  await step("Sign out of the dev session by switching to the sender persona", async () => {
    await page.goto("/api/dev/sign-in?as=sender");
    await expect(page.getByRole("heading", { level: 1, name: "Your hollers" })).toBeVisible();
    const state = await api("/api/dev/state");
    expect(state.persona).toBe("sender");
    expect(state.member.role).toBe("sender");
    return { persona: state.persona, member: state.member };
  });

  await step("Sign out from the account menu ends the session", async () => {
    await page.getByRole("button", { name: /, account$/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sign in to Holler" })).toBeVisible();
    const session = await (await page.request.get("/api/auth/get-session")).json();
    expect(session).toBeNull();
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
    return { session };
  });
}
