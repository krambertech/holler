import { hmacSha256, timingSafeEqual } from "../hmac";

const MAX_SKEW_SECONDS = 5 * 60;

export type SlackVerification =
  | { ok: true; body: string }
  | { ok: false; reason: "missing_headers" | "stale" | "bad_signature" | "no_secret" };

export async function verifySlackRequest(
  request: Request,
  signingSecret: string | undefined,
  now: Date = new Date(),
): Promise<SlackVerification> {
  if (!signingSecret) return { ok: false, reason: "no_secret" };
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");
  if (!timestamp || !signature) return { ok: false, reason: "missing_headers" };
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now.getTime() / 1000 - seconds) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale" };
  }
  const body = await request.text();
  const expected = await sign(signingSecret, `v0:${timestamp}:${body}`);
  if (!timingSafeEqual(expected, signature)) return { ok: false, reason: "bad_signature" };
  return { ok: true, body };
}

export async function sign(secret: string, payload: string): Promise<string> {
  const mac = await hmacSha256(secret, payload);
  return `v0=${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
