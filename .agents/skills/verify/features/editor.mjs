export const title = "Make a Holler";
export const persona = "lead";

const TITLE = "Q1 planning";
const QUESTION = "Which bet should we make first?";

export default async function drive({ page, step, api, expect }) {
  await step("New holler opens the start screen", async () => {
    await page.getByRole("link", { name: "New holler" }).click();
    await expect(page.getByRole("heading", { name: "What do you want to ask?" })).toBeVisible();
  });

  await step("Survey opens the writing page with the mode above the title", async () => {
    await page.getByRole("button", { name: /^Survey/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Write a survey" })).toBeAttached();
    await expect(page.getByRole("button", { name: "Mode: Survey" })).toBeVisible();
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

  await step("Next opens the sending page, with the back link in the same place", async () => {
    const before = await page.getByRole("link", { name: "Your hollers" }).boundingBox();
    await page.getByRole("button", { name: "Next: share" }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Send “${TITLE}”` })).toBeVisible();
    const after = await page.getByRole("button", { name: "Back to questions" }).boundingBox();
    expect(after?.x).toBe(before?.x);
    expect(after?.y).toBe(before?.y);
    await expect(page.getByRole("switch", { name: "Anonymous answers" })).toBeVisible();
  });

  await step(
    "Later opens the day, the time and whose clock, and the button schedules",
    async () => {
      await page.getByRole("radio", { name: "Later" }).click();
      await expect(page.getByRole("button", { name: "Schedule" })).toBeVisible();
      await expect(page.getByLabel("Whose clock")).toBeVisible();
    },
  );

  await step("Send with nobody chosen names what is missing", async () => {
    await page.getByRole("radio", { name: "Now" }).click();
    await expect(page.getByLabel("Whose clock")).toHaveCount(0);
    await page.locator('[data-slot="send-bar"]').getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Choose who to send it to.").first()).toBeVisible();
    const id = new URL(page.url()).searchParams.get("draft");
    const holler = await api(`/api/hollers/${id}`);
    expect(holler.status).toBe("draft");
    return { status: holler.status, problems: holler.problems };
  });
}
