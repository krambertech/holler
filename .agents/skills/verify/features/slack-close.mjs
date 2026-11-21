export const title = "Closing a holler tells its creator in Slack";
export const persona = "lead";

const TITLE = "Offsite: which dates work?";

export default async function drive({ page, step, api, post, slackState, expect }) {
  const state = await api("/api/dev/state");
  const offsite = state.hollers.find((h) => h.title === TITLE);
  const closed = state.hollers.filter((h) => h.status === "closed").length;
  const notice = `${TITLE} closed. ${offsite.answered} of ${offsite.recipients} answered.`;

  await step("Close the live offsite survey, the way Close now does", async () => {
    const after = await post(`/api/hollers/${offsite.id}/close`);
    expect(after.status).toBe("closed");
    const stored = await api("/api/dev/state");
    expect(stored.activity).toContainEqual(
      expect.objectContaining({ action: "holler.closed", via: "web", subjectId: offsite.id }),
    );
    return after;
  });

  await step("The creator gets the count, and every unanswered DM says it closed", async () => {
    const closedLine = `${TITLE} closed. It takes no more answers.`;
    const sent = await slackState(
      (s) =>
        s.slack.posted.some((m) => m.text === notice) &&
        s.slack.updated.filter((m) => m.text === closedLine).length === offsite.waiting.length,
      "the close notice and the closed DMs",
    );
    expect(sent.slack.posted).toContainEqual(
      expect.objectContaining({ channel: state.member.slackUserId, text: notice }),
    );
    expect(
      sent.slack.updated
        .filter((m) => m.text === closedLine)
        .map((m) => m.channel)
        .sort(),
    ).toEqual(offsite.waiting.map((id) => `D${id.slice(1)}`).sort());
    return sent.slack;
  });

  await step("Home moves it to Closed", async () => {
    await page.reload();
    await expect(
      page.getByRole("region", { name: `Closed ${closed + 1}` }).getByRole("link", { name: TITLE }),
    ).toBeVisible();
  });
}
