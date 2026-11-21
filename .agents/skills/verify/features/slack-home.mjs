export const title = "Holler inside Slack for senders";
export const persona = "lead";

const QUESTION = "Pizza or tacos on Friday?";
const PEOPLE = ["U0AT", "U0BC"];

const homeOf = (state, user) => state.slack.homes.filter((h) => h.userId === user).at(-1);
const says = (home, words) => Boolean(home?.text.some((line) => line.includes(words)));

export default async function drive({ page, step, post, slackState, expect }) {
  const slack = (body) => post("/api/dev/slack", body);
  let holler;

  await step("Mira opens Holler's Home in Slack and sees her hollers", async () => {
    await slack({ path: "events", as: "U0LEAD", event: { type: "app_home_opened", tab: "home" } });
    const state = await slackState((s) => says(homeOf(s, "U0LEAD"), "Your hollers"), "Mira's Home");
    expect(says(homeOf(state, "U0LEAD"), "How was your week?")).toBe(true);
    return homeOf(state, "U0LEAD");
  });

  await step("/holler with a question opens the quick pulse with it filled in", async () => {
    const reply = await slack({ path: "commands", as: "U0LEAD", text: QUESTION });
    expect(reply.status).toBe(200);
    const state = await slackState(
      (s) => s.slack.views.some((v) => v.callbackId === "holler_quick_pulse"),
      "the quick pulse",
    );
    return state.slack.views.at(-1);
  });

  await step("Send from the modal reaches two people and says so in the modal", async () => {
    const state0 = await slackState((s) => s.slack.views.length > 0, "the modal");
    const view = state0.slack.views.at(-1);
    const reply = await slack({
      path: "interactions",
      as: "U0LEAD",
      payload: {
        type: "view_submission",
        view: {
          id: view.viewId,
          callback_id: view.callbackId,
          private_metadata: view.privateMetadata,
          state: {
            values: {
              "quick:prompt": { value: { type: "plain_text_input", value: QUESTION } },
              "quick:kind": {
                holler_quick_kind: { type: "static_select", selected_option: { value: "options" } },
              },
              "quick:options": { value: { type: "plain_text_input", value: "Pizza\nTacos" } },
              "quick:people": { value: { type: "multi_users_select", selected_users: PEOPLE } },
              "quick:channels": { value: { type: "multi_channels_select", selected_channels: [] } },
              "quick:closes": {
                value: { type: "static_select", selected_option: { value: "72" } },
              },
              "quick:anonymous": { value: { type: "checkboxes", selected_options: [] } },
            },
          },
        },
      },
    });
    expect(reply.body.response_action).toBe("update");
    const state = await slackState(
      (s) =>
        PEOPLE.every((p) =>
          s.slack.posted.some((m) => m.channel === p && m.text.endsWith(QUESTION)),
        ) &&
        s.slack.viewUpdates.some((u) => u.text.some((line) => line.includes("went to 2 people"))),
      "two invites and the sent modal",
    );
    holler = state.hollers.find(
      (h) =>
        h.status === "live" && h.recipients === 2 && PEOPLE.every((p) => h.waiting.includes(p)),
    );
    expect(holler).toBeTruthy();
    return { holler, posted: state.slack.posted.slice(-2) };
  });

  await step("/holler results lists it with its count, only to Mira", async () => {
    const reply = await slack({ path: "commands", as: "U0LEAD", text: "results" });
    expect(reply.body.response_type).toBe("ephemeral");
    const text = JSON.stringify(reply.body.blocks);
    expect(text).toContain(QUESTION);
    expect(text).toContain("0 of 2 answered");
    return reply.body;
  });

  await step(
    "Send reminder on the Home reaches both, and the Home says when the next can go",
    async () => {
      await slack({
        path: "interactions",
        as: "U0LEAD",
        payload: {
          type: "block_actions",
          container: { type: "view", view_id: "VHOME" },
          view: { id: "VHOME", type: "home" },
          actions: [{ action_id: "holler_home_remind", value: holler.id }],
        },
      });
      const reminder = `A reminder: Mira still needs your answer to ${QUESTION}`;
      const state = await slackState(
        (s) =>
          s.slack.posted.filter((m) => m.text.startsWith("A reminder") && m.text.endsWith(QUESTION))
            .length === 2 && says(homeOf(s, "U0LEAD"), "Reminder sent at"),
        "two reminders and the redrawn Home",
      );
      expect(
        state.slack.posted
          .filter((m) => m.text === reminder)
          .map((m) => m.channel)
          .sort(),
      ).toEqual(PEOPLE);
      return homeOf(state, "U0LEAD");
    },
  );

  await step("Amara opens her Home and finds it waiting on her", async () => {
    await slack({ path: "events", as: "U0AT", event: { type: "app_home_opened", tab: "home" } });
    const state = await slackState((s) => says(homeOf(s, "U0AT"), QUESTION), "Amara's Home");
    expect(says(homeOf(state, "U0AT"), "Waiting on you")).toBe(true);
    return homeOf(state, "U0AT");
  });

  await step("The web Home lists the pulse", async () => {
    await page.reload();
    await expect(page.getByRole("link", { name: QUESTION })).toBeVisible();
  });
}
