import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../app";
import { syncDirectoryStep } from "../services/directory-sync";
import { completeInstall } from "../services/workspaces";
import { createSlackClient, exchangeInstallCode, SlackApiError } from "./client";

/**
 * "Add to Slack". `/install` sends the browser to Slack with a one-time state, and `/callback`
 * takes the code Slack returns, stores the bot and sends the person on to sign in. The callback
 * is a browser redirect, so Slack does not sign it; the state cookie is what proves the request
 * started here. The scopes match slack-app-manifest.json and docs/slack.md.
 */
export const BOT_SCOPES = [
  "chat:write",
  "im:write",
  "users:read",
  "users:read.email",
  "usergroups:read",
  "channels:read",
  "groups:read",
  "team:read",
  "commands",
] as const;

const STATE_COOKIE = "holler_slack_state";
/** The first steps of a directory sync run in the callback; the cron finishes a big workspace. */
const INSTALL_SYNC_PAGES = 4;

type Problem = "denied" | "expired" | "enterprise" | "failed" | "not_configured";
const toInstallPage = (problem?: Problem) =>
  problem ? `/install?problem=${problem}` : "/install?installed=1";

export const slackOAuthRoutes = new Hono<AppEnv>()
  .get("/install", (c) => {
    if (!c.env.SLACK_CLIENT_ID) return c.redirect(toInstallPage("not_configured"));
    const state = crypto.randomUUID();
    setCookie(c, STATE_COOKIE, state, {
      path: "/slack/oauth",
      httpOnly: true,
      secure: c.env.PRODUCT_URL.startsWith("https://"),
      sameSite: "Lax",
      maxAge: 10 * 60,
    });
    const authorize = new URL("https://slack.com/oauth/v2/authorize");
    authorize.searchParams.set("client_id", c.env.SLACK_CLIENT_ID);
    authorize.searchParams.set("scope", BOT_SCOPES.join(","));
    authorize.searchParams.set("redirect_uri", `${c.env.PRODUCT_URL}/slack/oauth/callback`);
    authorize.searchParams.set("state", state);
    return c.redirect(authorize.toString());
  })
  .get("/callback", async (c) => {
    const expected = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/slack/oauth" });
    const { code, state, error } = c.req.query();
    if (error) return c.redirect(toInstallPage("denied"));
    if (!expected || !state || state !== expected || !code) {
      return c.redirect(toInstallPage("expired"));
    }
    if (!c.env.SLACK_CLIENT_ID || !c.env.SLACK_CLIENT_SECRET) {
      return c.redirect(toInstallPage("not_configured"));
    }

    const now = c.get("now")();
    const db = c.get("db");
    try {
      const grant = await exchangeInstallCode({
        code,
        redirectUri: `${c.env.PRODUCT_URL}/slack/oauth/callback`,
        clientId: c.env.SLACK_CLIENT_ID,
        clientSecret: c.env.SLACK_CLIENT_SECRET,
      });
      const slack = createSlackClient(grant.botToken);
      const outcome = await completeInstall(db, {
        grant,
        slack,
        tokenKey: c.env.SLACK_TOKEN_KEY,
        now,
      });
      if (outcome.status === "enterprise") return c.redirect(toInstallPage("enterprise"));
      c.executionCtx.waitUntil(
        syncDirectoryStep(db, slack, outcome.workspaceId, now, INSTALL_SYNC_PAGES).catch(
          (syncError) => console.error("First directory sync failed", syncError),
        ),
      );
      return c.redirect(toInstallPage());
    } catch (installError) {
      console.error(
        "Slack install failed",
        installError instanceof SlackApiError ? installError.slackError : installError,
      );
      return c.redirect(toInstallPage("failed"));
    }
  });
