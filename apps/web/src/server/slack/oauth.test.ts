import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { app } from "../app";
import { BOT_SCOPES } from "./oauth";

const env = {
  SLACK_CLIENT_ID: "123.456",
  SLACK_CLIENT_SECRET: "secret",
  BETTER_AUTH_SECRET: "a-test-secret-that-is-long-enough-for-auth",
  PRODUCT_URL: "https://app.holler.team",
  DEV_ROUTES: "false",
};

describe("Add to Slack", () => {
  it("sends the browser to Slack with Holler's scopes and a state cookie", async () => {
    const response = await app.request("/slack/oauth/install", {}, env);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(location.searchParams.get("scope")?.split(",")).toContain("users:read");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://app.holler.team/slack/oauth/callback",
    );
    const state = location.searchParams.get("state");
    expect(response.headers.get("set-cookie")).toContain(`holler_slack_state=${state}`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("refuses a callback whose state did not start here", async () => {
    const response = await app.request(
      "/slack/oauth/callback?code=c&state=forged",
      { headers: { cookie: "holler_slack_state=real" } },
      env,
    );
    expect(response.headers.get("location")).toBe("/install?problem=expired");
  });

  it("says so when the person cancels on Slack's page", async () => {
    const response = await app.request("/slack/oauth/callback?error=access_denied", {}, env);
    expect(response.headers.get("location")).toBe("/install?problem=denied");
  });
});

describe("slack-app-manifest.json", () => {
  it("asks for the same bot scopes the install requests", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../../../../slack-app-manifest.json", import.meta.url), "utf8"),
    ) as { oauth_config: { scopes: { bot: string[] } } };
    expect([...manifest.oauth_config.scopes.bot].sort()).toEqual([...BOT_SCOPES].sort());
  });
});
