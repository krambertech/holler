/**
 * Checks Slack's request signature before anything reads the body as data.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * The signed string is `v0:<timestamp>:<raw body>`, HMAC-SHA256 with the app's signing secret.
 * A timestamp more than five minutes from now is refused, so a captured request cannot be replayed.
 */
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
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `v0=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
