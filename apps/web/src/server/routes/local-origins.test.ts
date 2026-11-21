import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import type { Bindings } from "../env";
import { testEnv } from "./v1/test-env";

let env: Bindings;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await testEnv()));
afterAll(() => dispose());

async function signOutFrom(origin: string, bindings: Bindings) {
  const signIn = await app.request("http://localhost:5280/api/dev/sign-in?as=lead", {}, bindings);
  const cookie = signIn.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const res = await app.request(
    `${origin}/api/auth/sign-out`,
    { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: "{}" },
    bindings,
  );
  return res.status;
}

describe("signing out locally", () => {
  it("works on any local port while dev routes are on, whatever PRODUCT_URL says", async () => {
    for (const port of [5280, 5290, 5299]) {
      expect(await signOutFrom(`http://localhost:${port}`, env)).toBe(200);
    }
  });

  it("is refused from an origin nobody trusts", async () => {
    expect(await signOutFrom("https://elsewhere.example", env)).toBe(403);
  });
});
