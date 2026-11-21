import { expect, test } from "@playwright/test";
import { expectAccessible, signInAs } from "./a11y";

test("a person sees every Holler sent to them, grouped by where it stands", async ({ page }) => {
  await signInAs(page, "sender");
  await page.getByRole("link", { name: "Your answers" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your answers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Waiting on you/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Answered/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Closed before you answered/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Answer in Slack\W+How was your week\?$/ }),
  ).toHaveAttribute("href", /^https:\/\/slack\.com\/app_redirect\?/);
  await expectAccessible(page);
});

test("a person reads what they answered on a named Holler", async ({ page }) => {
  await page.goto("/api/dev/sign-in?as=sender&to=/answers");
  await page.getByRole("link", { name: "Offsite: which dates work?" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Offsite: which dates work?" }),
  ).toBeVisible();
  await expect(page.getByText("Where would you rather go?")).toBeVisible();
  await expect(page.getByText(/^Answered /)).toBeVisible();
  await expectAccessible(page);
});

test("a person reads their own anonymous answers, and is told only they can", async ({ page }) => {
  await page.goto("/api/dev/sign-in?as=sender&to=/answers");
  await page.getByRole("link", { name: "Team health check" }).click();
  await expect(page.getByText("Only you can see which answers are yours.")).toBeVisible();
  await expect(page.getByText("How sustainable is your workload?")).toBeVisible();
  await expectAccessible(page);
});

test("a person cannot open answers to a Holler not sent to them", async ({ page }) => {
  await signInAs(page, "lead");
  const response = await page.request.get("/api/answers/holler_not_theirs");
  expect(response.status()).toBe(404);
});
