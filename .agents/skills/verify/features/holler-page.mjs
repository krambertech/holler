export const title = "The Holler page chases and closes";
export const persona = "lead";

const TITLE = "How was your week?";

export default async function drive({ page, step, api, slackState, expect }) {
  const state = await api("/api/dev/state");
  const pulse = state.hollers.find((h) => h.title === TITLE && h.status === "live");

  await step("Open the live pulse: waiting people come first", async () => {
    await page
      .getByRole("region", { name: /^Live \d+$/ })
      .getByRole("link", { name: TITLE })
      .click();
    const people = page.getByRole("region", {
      name: `${pulse.answered} of ${pulse.recipients} answered`,
    });
    await expect(people).toBeVisible();
    await expect(people.getByRole("listitem").first()).toContainText("Waiting");
    return { answered: pulse.answered, waiting: pulse.waiting };
  });

  await step("Send reminder reaches everyone still waiting", async () => {
    const before = (await api("/api/dev/state")).slack.posted.length;
    await page.getByRole("button", { name: "Send reminder" }).click();
    await expect(page.getByText(/^Reminder sent to the \d+ people still waiting\.$/)).toBeVisible();
    const sent = await slackState(
      (s) => s.slack.posted.length >= before + pulse.waiting.length,
      "a reminder DM for each waiting person",
    );
    const reminded = sent.slack.posted.slice(before).map((m) => m.channel).sort();
    expect(reminded).toEqual([...pulse.waiting].sort());
    await expect(page.getByRole("button", { name: "Send reminder" })).toBeDisabled();
    await expect(page.getByText(/You can send the next reminder/)).toBeVisible();
    return { reminded };
  });

  await step("Export has one row per answer", async () => {
    const response = await page.request.get(`/api/hollers/${pulse.id}/export?format=csv`);
    expect(response.ok()).toBe(true);
    const rows = (await response.text()).trim().split("\r\n");
    expect(rows).toHaveLength(pulse.answered + 1);
    return { header: rows[0] };
  });

  await step("Close now asks once, then closes", async () => {
    await page.getByRole("button", { name: "More for this Holler" }).click();
    await page.getByRole("menuitem", { name: "Close now" }).click();
    const dialog = page.getByRole("dialog", { name: "Close this Holler?" });
    await dialog.getByRole("button", { name: "Close now" }).click();
    await expect(page.getByText("Closed. It takes no more answers.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reminder" })).toHaveCount(0);
    const stored = await api("/api/dev/state");
    expect(stored.hollers.find((h) => h.id === pulse.id).status).toBe("closed");
    expect(stored.activity).toContainEqual(
      expect.objectContaining({ action: "holler.closed", via: "web", subjectId: pulse.id }),
    );
    return { status: "closed" };
  });
}
