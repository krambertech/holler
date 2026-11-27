export const title = "Sharing the results";
export const persona = "lead";

const TITLE = "How was your week?";

export default async function drive({ page, step, api, slackState, expect }) {
  const state = await api("/api/dev/state");
  const pulse = state.hollers.find((h) => h.title === TITLE && h.status === "live");
  const dialog = page.getByRole("dialog", { name: "Share results" });
  let added = "";
  let reportPath = "";

  await step("Share opens with only the creator able to see the results", async () => {
    await page
      .getByRole("region", { name: /^Live \d+$/ })
      .getByRole("link", { name: TITLE })
      .click();
    await page.getByRole("button", { name: "Share" }).click();
    await expect(dialog.getByRole("radio", { name: "You and the people you add" })).toBeChecked();
    return { visibility: "private" };
  });

  await step("Adding someone shares with them and sends them one Slack message", async () => {
    const before = (await api("/api/dev/state")).slack.posted.length;
    await dialog.getByRole("combobox").first().click();
    const person = page.getByRole("option").filter({ hasNotText: "Already shared" }).first();
    added = (await person.innerText()).trim().split("\n").at(-1);
    await person.click();
    await expect(
      dialog
        .getByRole("list", { name: "Shared with" })
        .getByRole("button", { name: `Stop sharing with ${added}`, exact: true }),
    ).toBeVisible();
    const sharing = await api(`/api/hollers/${pulse.id}/sharing`);
    const viewer = sharing.viewers.find((v) => v.name === added);
    expect(viewer).toBeTruthy();
    const sent = await slackState(
      (s) => s.slack.posted.slice(before).some((m) => m.channel === viewer.slackUserId),
      "the shared message to the person added",
    );
    const message = sent.slack.posted.slice(before).filter((m) => m.channel === viewer.slackUserId);
    expect(message).toHaveLength(1);
    expect(message[0].text).toContain(`shared the results of ${TITLE} with you`);
    expect(sent.activity).toContainEqual(
      expect.objectContaining({ action: "viewer.added", via: "web", subjectId: pulse.id }),
    );
    return { viewer: viewer.slackUserId, text: message[0].text };
  });

  await step("Make a report link", async () => {
    await dialog.getByRole("button", { name: "Make a report link" }).click();
    const link = dialog.getByRole("textbox", { name: "Report link" });
    await expect(link).toHaveValue(/\/report\/[A-Za-z0-9_-]{43}$/);
    reportPath = new URL(await link.inputValue()).pathname;
    const stored = await api("/api/dev/state");
    expect(stored.activity).toContainEqual(
      expect.objectContaining({ action: "report_link.made", via: "web", subjectId: pulse.id }),
    );
    return { reportPath };
  });

  await step("The report opens without a session and names no one", async () => {
    const origin = new URL(page.url()).origin;
    const outside = await page.context().browser().newContext();
    const stranger = await outside.newPage();
    try {
      await stranger.goto(`${origin}${reportPath}`);
      await expect(stranger.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
      await expect(
        stranger.getByText("It shows what people answered and never who."),
      ).toBeVisible();
      const report = await (await stranger.request.get(`${origin}/api${reportPath}`)).text();
      const own = JSON.stringify(await api(`/api/hollers/${pulse.id}/results`));
      const ids = [...new Set(own.match(/\bU[A-Z0-9]{2,}\b/g) ?? [])];
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.filter((id) => report.includes(id))).toEqual([]);
      return { idsChecked: ids.length };
    } finally {
      await outside.close();
    }
  });

  await step("Turn off stops the link at once", async () => {
    await dialog.getByRole("button", { name: "Turn off" }).click();
    await expect(dialog.getByRole("button", { name: "Make a report link" })).toBeVisible();
    const response = await page.request.get(`/api${reportPath}`);
    expect(response.status()).toBe(404);
    return { status: response.status() };
  });
}
