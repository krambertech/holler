export const title = "Sign in";
export const persona = "lead";

export default async function drive({ page, step, api, expect }) {
  await step("Land on Home as the lead persona", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "Your hollers" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Mira\b.*Settings$/ })).toBeVisible();
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
}
