import type { APIRequestContext, Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { expect, test } from "./fixtures";

let lead: APIRequestContext;

test.beforeEach(async ({ requestAs }) => {
  lead = await requestAs("lead");
});

async function webSurvey(anonymous = false): Promise<{ id: string; url: string }> {
  const made = await lead.post("/api/dev/web-survey", { data: { anonymous } });
  expect(made.status(), await made.text()).toBe(201);
  return made.json();
}

const question = (page: Page, prompt: string) => page.getByRole("group", { name: prompt });

test("a recipient answers every question type, with a follow-up after some answers", async ({
  page,
}) => {
  const { id, url } = await webSurvey();
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/api/")) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });
  const searches: string[] = [];
  page.on("request", (sent) => {
    if (sent.url().includes("/people")) searches.push(sent.url());
  });
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Offsite planning" })).toBeVisible();
  await expect(page.getByText("Mira sent you a Holler")).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Send answers" }).click();
  await expect(page.getByText("0 of 8 answered")).toHaveCount(0);
  await expect(page.getByText("7 questions still need an answer.")).toBeVisible();
  await expect(
    question(page, "Will you fly?").getByText("This question needs an answer."),
  ).toBeVisible();
  await expect(page.locator("fieldset [aria-invalid=true]")).toHaveCount(0);
  await expectAccessible(page);

  const where = question(page, "Where would you rather go?");
  const why = where.getByLabel("What makes it the right place?");
  await where.getByRole("radio", { name: "Lisbon" }).click();
  await expect(why).toBeHidden();
  await where.getByRole("radio", { name: "Tallinn" }).click();
  await expect(why).toBeVisible();
  await where.getByRole("radio", { name: "Other" }).click();
  await expect(where.getByLabel("Your own answer")).toBeFocused();
  await where.getByLabel("Your own answer").fill("Helsinki");
  await expect(where.getByRole("radio", { name: "Other" })).toBeChecked();
  await why.fill("Close to everyone");

  const weeks = question(page, "Which weeks work for you?");
  for (const week of ["8 March", "22 March", "5 April"]) {
    await weeks.getByRole("checkbox", { name: week }).click();
  }
  await expect(weeks.getByRole("checkbox", { name: "15 March" })).toBeDisabled();

  await question(page, "How tired are you of offsites?").getByRole("radio", { name: /^4/ }).click();
  await question(page, "Will you fly?").getByRole("radio", { name: "Yes" }).click();
  await question(page, "The last offsite was a good use of time.")
    .getByRole("radio", { name: "Agree", exact: true })
    .click();
  await question(page, "How many nights can you stay?").getByRole("textbox").fill("3");

  expect(searches).toEqual([]);
  await question(page, "Who should plan it?").getByRole("combobox").click();
  await page.getByRole("combobox", { name: "Search people" }).fill("Marta");
  await page.getByRole("option", { name: "Marta Kowalska" }).click();
  await page.keyboard.press("Escape");
  await expect(question(page, "Who should plan it?").getByRole("combobox")).toHaveText(
    /Marta Kowalska/,
  );

  await expect(page.getByText("7 of 8 answered")).toBeVisible();
  await page.getByRole("button", { name: "Send answers" }).click();
  await expect(page.getByRole("heading", { name: "Your answers are in" })).toBeVisible();
  await expect(page.getByText("Thank you. Mira sees them with everyone else's.")).toBeVisible();
  await expect(page.getByRole("link", { name: "See my answers" })).toHaveAttribute(
    "href",
    `/answers/${id}`,
  );
  await expectAccessible(page);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Your answers are in" })).toBeVisible();
  expect(failures).toEqual([]);
});

test("a worded scale whose end words do not fit one row stacks on a phone", async ({ page }) => {
  const draft = await lead.post("/api/hollers", {
    data: {
      mode: "survey",
      title: "Office days",
      audience: { people: ["U0LEAD"], groups: [], everyone: false },
      questions: [
        {
          type: "single",
          style: "scale",
          prompt: "How often do you come in?",
          options: [{ label: "No" }, { label: "Some" }, { label: "Yes" }],
          lowLabel: "Not once in the whole month",
          highLabel: "Every single working day",
          followUp: { prompt: "What would change that?", onlyAfter: [0] },
        },
      ],
    },
  });
  expect(draft.status(), await draft.text()).toBe(201);
  const { id } = await draft.json();
  const sent = await lead.post(`/api/hollers/${id}/send`);
  expect(sent.status(), await sent.text()).toBe(200);
  const link = await lead.get(`/api/dev/respond-link?holler=${id}&as=U0LEAD`);
  const { url } = await link.json();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(url);
  const scale = question(page, "How often do you come in?");
  await expect(scale.getByRole("radio", { name: "No, Not once in the whole month" })).toBeVisible();
  const last = await scale
    .getByRole("radio", { name: "Yes, Every single working day" })
    .boundingBox();
  expect((last?.x ?? Number.POSITIVE_INFINITY) + (last?.width ?? 0)).toBeLessThanOrEqual(375);
});

test("an anonymous Holler says what the sender will and will not see", async ({ page }) => {
  const { url } = await webSurvey(true);
  await page.goto(url);
  await expect(
    page.getByText("Anonymous. Mira sees how many people answered, never who said what."),
  ).toBeVisible();
  await expectAccessible(page);
});

test("a closed Holler says it closed instead of showing the form", async ({ page }) => {
  const { id, url } = await webSurvey();
  const closed = await lead.post(`/api/hollers/${id}/close`);
  expect(closed.status(), await closed.text()).toBe(200);
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "This Holler has closed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send answers" })).toHaveCount(0);
  await expectAccessible(page);
});

test("a changed link does not open the form", async ({ page }) => {
  const { url } = await webSurvey();
  await page.goto(url.replace("u=U0LEAD", "u=U0MK"));
  await expect(page.getByRole("heading", { name: "This link does not work" })).toBeVisible();
  await expectAccessible(page);
});
