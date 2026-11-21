import { describe, expect, it } from "vitest";
import { checkRespondLink, respondUrl } from "./respond-links";

const env = {
  BETTER_AUTH_SECRET: "a-test-secret-that-is-long-enough-for-auth",
  PRODUCT_URL: "https://app.holler.team",
};

async function signatureOf(url: string) {
  return new URL(url).searchParams.get("s") ?? "";
}

describe("respond links", () => {
  it("links to the Holler's form for this person", async () => {
    const url = await respondUrl(env, "hol_1", "UA");
    expect(url).toMatch(/^https:\/\/app\.holler\.team\/respond\/hol_1\?u=UA&s=[\w-]+$/);
    expect(await checkRespondLink(env, "hol_1", "UA", await signatureOf(url))).toBe(true);
  });

  it("refuses a link sent to someone else, for another Holler, or under another secret", async () => {
    const signed = await signatureOf(await respondUrl(env, "hol_1", "UA"));
    expect(await checkRespondLink(env, "hol_1", "UB", signed)).toBe(false);
    expect(await checkRespondLink(env, "hol_2", "UA", signed)).toBe(false);
    const other = {
      ...env,
      BETTER_AUTH_SECRET: "another-secret-that-is-long-enough-too",
    };
    expect(await checkRespondLink(other, "hol_1", "UA", signed)).toBe(false);
    expect(await checkRespondLink(env, "hol_1", "UA", "")).toBe(false);
  });
});
