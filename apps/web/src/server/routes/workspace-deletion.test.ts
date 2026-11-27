import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import type { Db } from "../db";
import type { Bindings } from "../env";
import { testEnv } from "./v1/test-env";

let env: Bindings;
let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, db, dispose } = await testEnv()));
afterAll(() => dispose());

const origin = "http://localhost:5280";

async function signedIn(as: "lead" | "sender") {
  const response = await app.request(`${origin}/api/dev/sign-in?as=${as}`, {}, env);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function deleteAs(cookie: string, confirmName: string) {
  return app.request(
    `${origin}/api/settings/workspace`,
    {
      method: "DELETE",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ confirmName }),
    },
    env,
  );
}

describe("DELETE /api/settings/workspace", () => {
  it("lets an owner delete the workspace, which signs everyone in it out", async () => {
    const sender = await signedIn("sender");
    const lead = await signedIn("lead");
    const [workspace] = await db.query.workspaces.findMany();
    if (!workspace) throw new Error("the dev workspace is missing");

    const refused = await deleteAs(sender, workspace.name);
    expect(refused.status).toBe(403);
    const mistyped = await deleteAs(lead, `${workspace.name}x`);
    expect(mistyped.status).toBe(400);
    expect(await mistyped.json()).toMatchObject({ error: { field: "confirmName" } });

    const deleted = await deleteAs(lead, workspace.name);
    expect(deleted.status, await deleted.clone().text()).toBe(200);
    expect(await db.query.workspaces.findMany()).toEqual([]);
    expect(await db.query.user.findMany()).toEqual([]);
    for (const cookie of [lead, sender]) {
      const me = await app.request(`${origin}/api/me`, { headers: { cookie } }, env);
      expect(me.status).toBeGreaterThanOrEqual(400);
    }
  });
});
