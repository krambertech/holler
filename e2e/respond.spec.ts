import { type APIRequestContext, expect, type Page, request, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

let lead: APIRequestContext;

test.beforeAll(async ({ baseURL }) => {
  lead = await request.newContext({ baseURL });
  await lead.get("/api/dev/sign-in?as=lead");
});
test.afterAll(() => lead.dispose());

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
  await expect(page.getByText("7 questions above still need your answer.")).toBeVisible();
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
  await expect(where.getByLabel("If Other, what?")).toBeFocused();
  await where.getByLabel("If Other, what?").fill("Helsinki");
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

test("an anonymous Holler says what the sender will and will not see", async ({ page }) => {
  const { url } = await webSurvey(true);
  await page.goto(url);
  await expect(page.getByText("Anonymous", { exact: true })).toBeVisible();
  await expect(page.getByText(/Your name is not kept with your answers/)).toBeVisible();
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
