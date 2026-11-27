import { expectAccessible, signInAs } from "./a11y";
import { expect, test } from "./fixtures";

test("a lead starts a Holler from the start screen", async ({ page }) => {
  await signInAs(page, "lead");
  await page.getByRole("link", { name: "New holler" }).click();
  await expect(page.getByRole("heading", { name: "What do you want to ask?" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Survey/ })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: /^Weekly pulse/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Write a pulse" })).toBeAttached();
  await expect(page.getByRole("button", { name: "Mode: Pulse" })).toBeVisible();
  await expect(page.getByLabel("Question 1", { exact: true })).toHaveValue("How was your week?");
  await expect(page.getByText("Slack DM")).toBeVisible();
  await page.getByRole("button", { name: "Why people answer here" }).click();
  await expect(page.getByText(/answer it there with a tap/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expectAccessible(page);
});

test("a lead writes a survey, it saves as a draft, and Send names what is missing", async ({
  page,
}) => {
  await signInAs(page, "lead");
  await expect(page.getByRole("heading", { name: "Your hollers" })).toBeVisible();
  await page.goto("/new?mode=survey");
  await expect(page.getByRole("heading", { level: 1, name: "Write a survey" })).toBeAttached();

  await page.getByRole("textbox", { name: "Title" }).fill("Q1 planning");
  await page.getByRole("button", { name: "Single choice" }).click();
  await page.getByLabel("Question 1", { exact: true }).fill("Which bet should we make first?");
  await page.getByLabel("Question 1, option 1").fill("Faster onboarding");
  await page.getByLabel("Question 1, option 2").fill("Billing clean-up");

  await expect(page).toHaveURL(/draft=hol_/);
  await expect(page.getByText("Draft saved")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Question 1", { exact: true })).toHaveValue(
    "Which bet should we make first?",
  );

  await page.getByRole("button", { name: "Next: share" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Send “Q1 planning”" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who gets it" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "When it goes out" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Anonymous answers" })).toBeVisible();
  await expectAccessible(page);

  await page.locator('[data-slot="send-bar"]').getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Choose who to send it to.").first()).toBeVisible();
  await expectAccessible(page);
});

test("a draft on Home opens in the editor", async ({ page }) => {
  await signInAs(page, "lead");
  await expect(page.getByRole("heading", { name: "Your hollers" })).toBeVisible();
  await page.goto("/new?mode=pulse");
  await page.getByRole("button", { name: "Free text" }).click();
  await page.getByLabel("Question 1", { exact: true }).fill("What is your one focus this week?");
  await expect(page).toHaveURL(/draft=hol_/);
  await expect(page.getByText("Draft saved")).toBeVisible();
  const id = new URL(page.url()).searchParams.get("draft");

  await page.goto(`/hollers/${id}`);
  await expect(page).toHaveURL(new RegExp(`/new\\?draft=${id}`));
  await expect(page.getByLabel("Question 1", { exact: true })).toHaveValue(
    "What is your one focus this week?",
  );
});

test("leaving the editor straight after typing keeps the draft", async ({ page }) => {
  await signInAs(page, "lead");
  await expect(page.getByRole("heading", { name: "Your hollers" })).toBeVisible();
  await page.goto("/new?mode=survey");
  await page.getByRole("textbox", { name: "Title" }).fill("Left in a hurry");
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/hollers") && r.request().method() === "POST",
  );
  await page.getByRole("link", { name: "Your hollers" }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  await expect(page.getByRole("heading", { name: "Your hollers" })).toBeVisible();
  const { id } = (await response.json()) as { id: string };
  const draft = await page.request.get(`/api/hollers/${id}`);
  expect(((await draft.json()) as { title: string }).title).toBe("Left in a hurry");
});

test("the back link keeps its place, and a draft is deleted from its menu", async ({ page }) => {
  await signInAs(page, "lead");
  await expect(page.getByRole("heading", { name: "Your hollers" })).toBeVisible();
  await page.goto("/new?mode=survey");
  await page.getByRole("textbox", { name: "Title" }).fill("To be deleted");
  await expect(page).toHaveURL(/draft=hol_/);
  const back = page.getByRole("link", { name: "Your hollers" });
  const writing = await back.boundingBox();

  await page.getByRole("button", { name: "Next: share" }).click();
  const toQuestions = page.getByRole("button", { name: "Back to questions" });
  await expect(toQuestions).toBeVisible();
  const sending = await toQuestions.boundingBox();
  expect(sending?.x).toBe(writing?.x);
  expect(sending?.y).toBe(writing?.y);

  await toQuestions.click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("To be deleted");

  await page.getByRole("button", { name: "More for this draft" }).click();
  await page.getByRole("menuitem", { name: "Delete draft" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete draft" }).click();
  await expect(page.getByRole("heading", { name: "Your hollers" })).toBeVisible();
  await expect(page.getByText("To be deleted")).toHaveCount(0);
});
