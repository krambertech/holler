export const title = "A holler goes out in Slack and comes back answered";
export const persona = "lead";

const TITLE = "Lunch on Friday?";
const PEOPLE = ["U0AT", "U0BC", "U0DA"];

export default async function drive({ page, base, step, post, slackState, expect }) {
  let holler;

  await step("Write a one-question pulse and send it to three people", async () => {
    const draft = await post("/api/hollers", {
      mode: "pulse",
      title: TITLE,
      questions: [{ type: "single", prompt: TITLE, options: [{ label: "Yes" }, { label: "No" }] }],
      audience: { people: PEOPLE, groups: [], everyone: false },
      announceChannelId: "C0GENERAL",
    });
    holler = await post(`/api/hollers/${draft.id}/send`);
    expect(holler.status).toBe("live");
    return holler;
  });

  await step("Each of them gets an invite DM, and the channel gets the announcement", async () => {
    const invite = `Mira sent you a Holler: ${TITLE}`;
    const state = await slackState(
      (s) => s.slack.posted.filter((m) => m.text === invite).length === PEOPLE.length,
      "three invites",
    );
    expect(
      state.slack.posted
        .filter((m) => m.text === invite)
        .map((m) => m.channel)
        .sort(),
    ).toEqual(PEOPLE);
    expect(state.slack.posted).toContainEqual(
      expect.objectContaining({
        channel: "C0GENERAL",
        text: `Mira sent a Holler to 3 people: ${TITLE}`,
      }),
    );
    return state.slack;
  });

  await step("One answers Yes; their DM thanks them in place", async () => {
    const yes = holler.questions[0].options.find((o) => o.label === "Yes");
    await post("/api/dev/answer", {
      hollerId: holler.id,
      slackUserId: PEOPLE[0],
      response: { answers: [{ questionId: holler.questions[0].id, optionIds: [yes.id] }] },
    });
    const state = await slackState(
      (s) => s.slack.updated.some((m) => m.channel === "D0AT" && m.text.startsWith("Thanks.")),
      "the thank-you",
    );
    expect(state.hollers.find((h) => h.id === holler.id)).toMatchObject({
      answered: 1,
      recipients: 3,
    });
    return state.slack;
  });

  await step("Send reminder reaches the two still waiting, once", async () => {
    await post(`/api/hollers/${holler.id}/remind`);
    const reminder = `A reminder: Mira still needs your answer to ${TITLE}`;
    const state = await slackState(
      (s) => s.slack.posted.filter((m) => m.text === reminder).length === 2,
      "two reminders",
    );
    expect(
      state.slack.posted
        .filter((m) => m.text === reminder)
        .map((m) => m.channel)
        .sort(),
    ).toEqual(PEOPLE.slice(1));
    const again = await page.request.post(`${base}/api/hollers/${holler.id}/remind`);
    expect(again.status()).toBe(409);
    return state.slack;
  });

  await step("Closing it tells Mira the count", async () => {
    await post(`/api/hollers/${holler.id}/close`);
    const notice = `${TITLE} closed. 1 of 3 answered.`;
    const state = await slackState(
      (s) => s.slack.posted.some((m) => m.text === notice),
      "the close notice",
    );
    return state.slack;
  });

  await step("Home lists it under Closed", async () => {
    await page.reload();
    await expect(page.getByRole("link", { name: TITLE })).toBeVisible();
  });
}
