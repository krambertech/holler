import { test as base, expect } from "@playwright/test";

const expectedClientError = /^Failed to load resource: the server responded with a status of 4\d\d/;

export const test = base.extend<{ pageStaysQuiet: void }>({
  pageStaysQuiet: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !expectedClientError.test(message.text()))
          problems.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
      page.on("response", (response) => {
        if (response.status() >= 500)
          problems.push(`${response.status()}: ${response.request().method()} ${response.url()}`);
      });
      await use();
      expect(problems, "the page logged errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
