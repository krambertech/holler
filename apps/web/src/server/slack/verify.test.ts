import { describe, expect, it } from "vitest";
import { sign, verifySlackRequest } from "./verify";

const secret = "8f742231b10e8888abcd99yyyzzz85a5";
const now = new Date("2026-11-20T10:00:00Z");
const ts = String(Math.floor(now.getTime() / 1000));

async function request(body: string, timestamp = ts, signature?: string) {
  return new Request("https://app.holler.team/slack/interactions", {
    method: "POST",
    body,
    headers: {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature ?? (await sign(secret, `v0:${timestamp}:${body}`)),
    },
  });
}

describe("verifySlackRequest", () => {
  it("accepts a correctly signed request and returns the raw body", async () => {
    expect(await verifySlackRequest(await request("payload=1"), secret, now)).toEqual({
      ok: true,
      body: "payload=1",
    });
  });

  it("refuses a changed body", async () => {
    const signed = await sign(secret, `v0:${ts}:payload=1`);
    expect(
      await verifySlackRequest(await request("payload=2", ts, signed), secret, now),
    ).toMatchObject({ ok: false, reason: "bad_signature" });
  });

  it("refuses a replay older than five minutes", async () => {
    const old = String(Number(ts) - 301);
    expect(await verifySlackRequest(await request("x", old), secret, now)).toMatchObject({
      ok: false,
      reason: "stale",
    });
  });

  it("refuses everything when no signing secret is set", async () => {
    expect(await verifySlackRequest(await request("x"), undefined, now)).toMatchObject({
      ok: false,
      reason: "no_secret",
    });
  });
});
