import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import type { Db } from "../db";
import type { Bindings } from "../env";
import { testEnv } from "./v1/test-env";

/**
 * Browser tests sign in as personas from parallel workers, so the first sign-ins on a fresh
 * database race. Every one must succeed, and the dev workspace must be seeded exactly once.
 */

let env: Bindings;
let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, db, dispose } = await testEnv()));
afterAll(() => dispose());

/** 302 for a sign-in that worked, otherwise what went wrong, so a failure says why. */
async function outcome(settled: PromiseSettledResult<Response>) {
  if (settled.status === "rejected") return String(settled.reason);
  if (settled.value.status === 302) return 302;
  return `${settled.value.status} ${await settled.value.text()}`;
}

describe("concurrent first dev sign-ins", () => {
  it("all succeed and seed once", async () => {
    const signIns = ["lead", "lead", "lead", "sender", "sender", "sender", "lead", "sender"].map(
      (as) => app.request(`http://localhost:5280/api/dev/sign-in?as=${as}`, {}, env),
    );
    const settled = await Promise.allSettled(signIns);
    expect(await Promise.all(settled.map(outcome))).toEqual(signIns.map(() => 302));
    expect(await db.query.workspaces.findMany()).toHaveLength(1);
    const users = await db.query.user.findMany();
    expect(users.map((u) => u.name).sort()).toEqual(["Mira Kask", "Tom Okafor"]);
    expect(await db.query.members.findMany()).toHaveLength(2);
    expect(await db.query.slackPeople.findMany()).toHaveLength(18);
    expect(await db.query.hollers.findMany()).toHaveLength(8);
  });
});
