export const title = "A recipient answers on the web form";
export const persona = "lead";

export default async function drive({ page, step, api, post, expect }) {
  const made = await post("/api/dev/web-survey", {});
  const survey = async () => (await api("/api/dev/state")).hollers.find((h) => h.id === made.id);
  const question = (prompt) => page.getByRole("group", { name: prompt });

  await step("Open the signed link from the DM", async () => {
    await page.goto(made.url);
    await expect(page.getByRole("heading", { level: 1, name: "Offsite planning" })).toBeVisible();
    await expect(page.getByText("Mira sent you a Holler")).toBeVisible();
    return survey();
  });

  await step("Sending with nothing answered puts each problem beside its question", async () => {
    await page.getByRole("button", { name: "Send answers" }).click();
    await expect(page.getByText("7 questions above still need your answer.")).toBeVisible();
    const before = await survey();
    expect(before.answered).toBe(0);
    return before;
  });

  await step("The follow-up shows after Tallinn and Other, not after Lisbon", async () => {
    const where = question("Where would you rather go?");
    const why = where.getByLabel("What makes it the right place?");
    await where.getByRole("radio", { name: "Lisbon" }).click();
    await expect(why).toBeHidden();
    await where.getByRole("radio", { name: "Tallinn" }).click();
    await expect(why).toBeVisible();
    await where.getByRole("radio", { name: "Other" }).click();
    await where.getByLabel("If Other, what?").fill("Helsinki");
    await why.fill("Close to everyone");
  });

  await step("Answer the rest of the questions", async () => {
    const weeks = question("Which weeks work for you?");
    for (const week of ["8 March", "22 March", "5 April"]) {
      await weeks.getByRole("checkbox", { name: week }).click();
    }
    await expect(weeks.getByRole("checkbox", { name: "15 March" })).toBeDisabled();
    await question("How tired are you of offsites?").getByRole("radio", { name: /^4/ }).click();
    await question("Will you fly?").getByRole("radio", { name: "Yes" }).click();
    await question("The last offsite was a good use of time.")
      .getByRole("radio", { name: "Agree", exact: true })
      .click();
    await question("How many nights can you stay?").getByRole("textbox").fill("3");
    await question("Who should plan it?").getByRole("combobox").click();
    await page.getByRole("combobox", { name: "Search people" }).fill("Marta");
    await page.getByRole("option", { name: "Marta Kowalska" }).click();
    await page.keyboard.press("Escape");
  });

  await step("Send, and the thank-you replaces the form", async () => {
    await page.getByRole("button", { name: "Send answers" }).click();
    await expect(page.getByRole("heading", { name: "Your answers are in" })).toBeVisible();
    const after = await survey();
    expect(after.answered).toBe(1);
    expect(after.waiting).not.toContain("U0LEAD");
    const results = await api(`/api/hollers/${made.id}/results`);
    expect(JSON.stringify(results)).toContain("Helsinki");
    expect(JSON.stringify(results)).toContain("Close to everyone");
    return { ...after, results: results.questions?.[0] };
  });
}
