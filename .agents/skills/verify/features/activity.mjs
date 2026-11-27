export const title = "Activity in Settings";
export const persona = "lead";
export const start = "/settings";

export default async function drive({ page, step, api, post, expect }) {
  const list = page.getByRole("list", { name: "Activity" });

  await step("A new draft is the newest line, in words", async () => {
    await expect(page.getByRole("heading", { level: 2, name: "Activity" })).toBeVisible();
    const draft = await post("/api/hollers", { mode: "pulse", title: "Activity check" });
    await page.reload();
    await expect(list.getByRole("listitem").first()).toContainText(
      "Mira started the draft Activity check.",
    );
    await expect(
      list.getByRole("listitem").first().getByRole("link", { name: "Activity check" }),
    ).toHaveAttribute("href", `/hollers/${draft.id}`);
    const out = await api("/api/settings/activity");
    expect(out.entries[0]).toMatchObject({
      action: "holler.created",
      via: "web",
      subject: { id: draft.id, name: "Activity check" },
    });
    return { first: out.entries[0] };
  });

  await step("A sender sees no Activity and cannot read it", async () => {
    await page.goto("/api/dev/sign-in?as=sender");
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activity" })).toHaveCount(0);
    const response = await page.request.get("/api/settings/activity");
    expect(response.status()).toBe(403);
    return { status: response.status() };
  });
}
