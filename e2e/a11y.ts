import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Fails the test on any WCAG 2.2 AA violation on the page as it is now. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`,
    ),
    "axe found WCAG violations",
  ).toEqual([]);
}

export async function signInAs(page: Page, persona: "lead" | "sender") {
  await page.goto(`/api/dev/sign-in?as=${persona}`);
}
