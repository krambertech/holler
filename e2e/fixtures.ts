import { randomUUID } from "node:crypto";
import { type APIRequestContext, test as base, expect } from "@playwright/test";

type Persona = "lead" | "sender";

const expectedClientError = /^Failed to load resource: the server responded with a status of 4\d\d/;

function ownWorkspace() {
  return { "x-holler-dev-workspace": randomUUID().replaceAll("-", "") };
}

interface Fixtures {
  pageStaysQuiet: void;
  requestAs: (persona: Persona) => Promise<APIRequestContext>;
}

export const test = base.extend<Fixtures>({
  extraHTTPHeaders: async ({ browserName: _browser }, use) => use(ownWorkspace()),
  requestAs: async ({ page: _page, playwright, baseURL, extraHTTPHeaders }, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async (persona) => {
      const context = await playwright.request.newContext({
        ...(baseURL ? { baseURL } : {}),
        ...(extraHTTPHeaders ? { extraHTTPHeaders } : {}),
      });
      contexts.push(context);
      const signedIn = await context.get(`/api/dev/sign-in?as=${persona}`);
      if (!signedIn.ok()) throw new Error(`Could not sign in as ${persona}: ${signedIn.status()}`);
      return context;
    });
    await Promise.all(contexts.map((context) => context.dispose()));
  },
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
