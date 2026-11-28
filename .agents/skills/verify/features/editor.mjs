export const title = "Make a Holler";
export const persona = "lead";

const TITLE = "Q1 planning";
const QUESTION = "Which bet should we make first?";

export default async function drive({ page, step, api, expect }) {
  await step("New holler opens the start screen", async () => {
    await page.getByRole("link", { name: "New holler" }).click();
    await expect(page.getByRole("heading", { name: "What do you want to ask?" })).toBeVisible();
  });

  await step("Survey opens the editor with New survey in the top row", async () => {
    await page.getByRole("button", { name: /^Survey/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Write a survey" })).toBeAttached();
    await expect(page.getByRole("button", { name: "New survey" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Your hollers" })).toBeVisible();
  });

  await step("Write a title and a single-choice question, and it saves as a draft", async () => {
    await page.getByRole("textbox", { name: "Title" }).fill(TITLE);
    await page.getByRole("button", { name: "Single choice" }).click();
    await page.getByLabel("Question 1", { exact: true }).fill(QUESTION);
    await page.getByLabel("Question 1, option 1").fill("Faster onboarding");
    await page.getByLabel("Question 1, option 2").fill("Billing clean-up");
    await expect(page).toHaveURL(/draft=hol_/);
    await expect(page.getByText("Draft saved")).toBeVisible();
    const id = new URL(page.url()).searchParams.get("draft");
    const holler = await api(`/api/hollers/${id}`);
    expect(holler.status).toBe("draft");
    expect(holler.title).toBe(TITLE);
    expect(holler.questions[0].prompt).toBe(QUESTION);
    return { id, status: holler.status, questions: holler.questions.length };
  });

  await step("Reloading keeps every word", async () => {
    await page.reload();
    await expect(page.getByLabel("Question 1", { exact: true })).toHaveValue(QUESTION);
    await expect(page.getByLabel("Question 1, option 2")).toHaveValue("Billing clean-up");
  });

  await step("Who gets it and the Anonymous switch sit in one card above the title", async () => {
    await expect(page.getByRole("region", { name: "Audience" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Anonymous" })).toBeVisible();
    await expect(page.locator('[data-slot="audience-reach"]')).toHaveText("Nobody yet");
  });

  await step(
    "Schedule opens a dialog with the day, the time, the time zone and the three settings",
    async () => {
      await page.getByRole("button", { name: "More ways to send" }).click();
      await page.getByRole("menuitem", { name: "Schedule…" }).click();
      const dialog = page.getByRole("dialog", { name: `Schedule “${TITLE}”` });
      await expect(dialog.getByRole("combobox", { name: "Time zone" })).toBeVisible();
      await expect(dialog.getByRole("switch", { name: "Reminders" })).toBeChecked();
      await expect(dialog.getByRole("switch", { name: "Live count" })).not.toBeChecked();
      await expect(dialog.getByRole("button", { name: "Schedule" })).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
    },
  );

  await step("Send with nobody chosen closes the dialog and names what is missing", async () => {
    await page
      .locator('[data-slot="send-bar"]')
      .getByRole("button", { name: "Send", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: `Send “${TITLE}”` });
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Choose who to send it to.").first()).toBeVisible();
    const id = new URL(page.url()).searchParams.get("draft");
    const holler = await api(`/api/hollers/${id}`);
    expect(holler.status).toBe("draft");
    return { status: holler.status, problems: holler.problems };
  });
}
