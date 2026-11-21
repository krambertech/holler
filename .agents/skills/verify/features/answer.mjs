export const title = "An answer reaches the results";
export const persona = "lead";

const TITLE = "How was your week?";

export default async function drive({ page, step, api, post, expect }) {
  const live = async () =>
    (await api("/api/dev/state")).hollers.find((h) => h.title === TITLE && h.status === "live");
  const seeded = await live();

  await step("Open the live weekly pulse from Home", async () => {
    await page
      .getByRole("region", { name: /^Live \d+$/ })
      .getByRole("link", { name: TITLE })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByText(`${seeded.answered} answered`).first()).toBeVisible();
    return seeded;
  });

  await step("A waiting recipient answers Great, the way their Slack button would", async () => {
    const detail = await api(`/api/hollers/${seeded.id}`);
    const answers = detail.questions.map((q) =>
      q.type === "text"
        ? { questionId: q.id, text: "Shipping the pricing page." }
        : { questionId: q.id, optionIds: [q.options.find((o) => o.label === "Great").id] },
    );
    const slackUserId = seeded.waiting[0];
    await post("/api/dev/answer", { hollerId: seeded.id, slackUserId, response: { answers } });
    const after = await live();
    expect(after.answered).toBe(seeded.answered + 1);
    expect(after.waiting).not.toContain(slackUserId);
    return { slackUserId, ...after };
  });

  await step("The results page shows one more answer and the new text", async () => {
    await page.reload();
    await expect(page.getByText(`${seeded.answered + 1} answered`).first()).toBeVisible();
    await expect(page.getByText("Shipping the pricing page.")).toBeVisible();
  });

  await step("Home counts the answer too", async () => {
    await page.getByRole("link", { name: "Your hollers" }).click();
    // The progress ring is hidden at phone width; the count text shows at every width.
    await expect(
      page
        .getByRole("region", { name: /^Live \d+$/ })
        .getByText(`${seeded.answered + 1} of ${seeded.recipients}`, { exact: true }),
    ).toBeVisible();
  });
}
