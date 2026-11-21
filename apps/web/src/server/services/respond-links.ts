import { hmacSha256, timingSafeEqual } from "../hmac";

/** The two settings a link needs; the Worker's Bindings has both. */
interface LinkEnv {
  BETTER_AUTH_SECRET: string;
  PRODUCT_URL: string;
}

/**
 * The signed link in a DM that opens the web form for a Holler answered on the web. The
 * signature binds the Holler to the person, so the page knows who is answering without a
 * sign-in, and a link sent to one person cannot answer as another. docs/slack.md, Answering.
 */

async function signature(env: LinkEnv, hollerId: string, slackUserId: string) {
  const mac = await hmacSha256(env.BETTER_AUTH_SECRET, `respond:${hollerId}:${slackUserId}`);
  return btoa(String.fromCharCode(...mac))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export async function respondUrl(env: LinkEnv, hollerId: string, slackUserId: string) {
  const query = new URLSearchParams({
    u: slackUserId,
    s: await signature(env, hollerId, slackUserId),
  });
  return `${env.PRODUCT_URL}/respond/${hollerId}?${query}`;
}

/** True when `signed` is this person's link to this Holler. */
export async function checkRespondLink(
  env: LinkEnv,
  hollerId: string,
  slackUserId: string,
  signed: string,
): Promise<boolean> {
  return timingSafeEqual(await signature(env, hollerId, slackUserId), signed);
}
