import { foldForSearch } from "@holler/core";
import { eq } from "@holler/core/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBatch } from "../batch";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import type { ServiceContext } from "./context";
import { resolveDirectory, searchDirectory } from "./directory";
import { makeLive, workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

const team: [id: string, name: string, handle: string | null][] = [
  ["U1", "Anastasia Moreau", "stasia"],
  ["U2", "Dana Alon", "dana"],
  ["U3", "Ana Torres", "ana.t"],
  ["U4", "Ana Lima", "analima"],
  ["U5", "Tomás Ruiz", null],
  ["U6", "Mira Kask", "mira"],
  ["U7", "Ilya Volkov", "Ілля"],
];

async function workspace() {
  const fixture = await workspaceFixture(db);
  const { workspaceId } = fixture;
  await runBatch(db, [
    ...team.map(([slackUserId, name, displayName]) =>
      db.insert(schema.slackPeople).values({
        workspaceId,
        slackUserId,
        name,
        displayName,
        email: `${slackUserId.toLowerCase()}@northwind.test`,
        searchName: foldForSearch(name, displayName),
      }),
    ),
    db.insert(schema.slackGroups).values({
      workspaceId,
      slackId: "S1",
      kind: "usergroup",
      name: "Design team",
      handle: "design-team",
      memberCount: 6,
      searchName: foldForSearch("Design team", "design-team"),
    }),
    db.insert(schema.slackGroups).values({
      workspaceId,
      slackId: "S2",
      kind: "usergroup",
      name: "Product leads",
      handle: "product-leads",
      memberCount: 4,
      searchName: foldForSearch("Product leads", "product-leads"),
    }),
    db.insert(schema.slackGroups).values({
      workspaceId,
      slackId: "C1",
      kind: "channel",
      name: "product",
      memberCount: 30,
      searchName: foldForSearch("product"),
    }),
  ]);
  return fixture;
}

/** A Holler this sender sent, to these people, naming these groups. */
async function sent(ctx: ServiceContext, now: Date, people: string[], groups: string[] = []) {
  const holler = await createDraft(ctx, {
    mode: "chase",
    title: "Form",
    externalUrl: "https://example.test",
  });
  await db
    .update(schema.hollers)
    .set({ audience: { people, groups, everyone: false } })
    .where(eq(schema.hollers.id, holler.id));
  await makeLive(db, holler.id, people, now);
}

const names = (found: { people: { name: string }[] }) => found.people.map((p) => p.name);

describe("searchDirectory", () => {
  it("puts names that start with what was typed above names it is inside", async () => {
    const { ctx } = await workspace();
    expect(names(await searchDirectory(ctx, "ana"))).toEqual([
      "Ana Lima",
      "Ana Torres",
      "Anastasia Moreau",
      "Dana Alon",
    ]);
  });

  it("puts people the sender sends to often first among equal matches", async () => {
    const { ctx, now } = await workspace();
    await sent(ctx, now, ["U3"]);
    await sent(ctx, now, ["U3", "U1"]);
    expect(names(await searchDirectory(ctx, "ana"))).toEqual([
      "Ana Torres",
      "Ana Lima",
      "Anastasia Moreau",
      "Dana Alon",
    ]);
    // Sent once, Anastasia still comes after a whole first name, and before Ana Lima on "an".
    expect(names(await searchDirectory(ctx, "an")).slice(0, 2)).toEqual([
      "Ana Torres",
      "Anastasia Moreau",
    ]);
    const empty = await searchDirectory(ctx, "");
    expect(empty.people.slice(0, 2).map((p) => [p.name, p.sends])).toEqual([
      ["Ana Torres", 2],
      ["Anastasia Moreau", 1],
    ]);
  });

  it("matches last names, handles and every word in any order", async () => {
    const { ctx } = await workspace();
    expect(names(await searchDirectory(ctx, "kask"))).toEqual(["Mira Kask"]);
    expect(names(await searchDirectory(ctx, "@mira"))).toEqual(["Mira Kask"]);
    expect(names(await searchDirectory(ctx, "kask mi"))).toEqual(["Mira Kask"]);
    expect(names(await searchDirectory(ctx, "ілля"))).toEqual(["Ilya Volkov"]);
  });

  it("ignores case and accents both ways", async () => {
    const { ctx } = await workspace();
    expect(names(await searchDirectory(ctx, "tomas"))).toEqual(["Tomás Ruiz"]);
    expect(names(await searchDirectory(ctx, "TOMÁS RU"))).toEqual(["Tomás Ruiz"]);
  });

  it("finds groups by handle, and only channels after #", async () => {
    const { ctx } = await workspace();
    const design = await searchDirectory(ctx, "@design-team");
    expect(design.groups.map((g) => g.slackId)).toEqual(["S1"]);
    const product = await searchDirectory(ctx, "#product");
    expect(product).toMatchObject({ people: [], groups: [{ slackId: "C1" }] });
    const any = await searchDirectory(ctx, "product");
    expect(any.groups.map((g) => g.slackId)).toEqual(["C1", "S2"]);
  });

  it("puts the groups the sender sends to first", async () => {
    const { ctx, now } = await workspace();
    await sent(ctx, now, ["U2"], ["S2"]);
    // "product" names the channel outright; "prod" starts both, so the sends decide.
    expect((await searchDirectory(ctx, "product")).groups[0]?.slackId).toBe("C1");
    const prod = await searchDirectory(ctx, "prod");
    expect(prod.groups.map((g) => [g.slackId, g.sends])).toEqual([
      ["S2", 1],
      ["C1", 0],
    ]);
  });

  it("says when the first directory sync is still running", async () => {
    const { ctx, workspaceId, now } = await workspace();
    expect((await searchDirectory(ctx, "")).syncing).toBe(false);
    await db.insert(schema.directorySyncs).values({ workspaceId, runStartedAt: now });
    expect((await searchDirectory(ctx, "")).syncing).toBe(true);
    await db
      .update(schema.directorySyncs)
      .set({ completedAt: now, runStartedAt: null })
      .where(eq(schema.directorySyncs.workspaceId, workspaceId));
    expect((await searchDirectory(ctx, "")).syncing).toBe(false);
  });
});

describe("resolveDirectory", () => {
  it("adds each pasted name, handle and email that names one, and says which did not", async () => {
    const { ctx } = await workspace();
    const found = await resolveDirectory(ctx, [
      "Ana Torres",
      "@mira",
      "U5@Northwind.test",
      "#product",
      "@design-team",
      "Ana",
      "zed",
      "ana torres",
    ]);
    expect(found.people.map((p) => p.slackUserId).sort()).toEqual(["U3", "U5", "U6"]);
    expect(found.groups.map((g) => g.slackId).sort()).toEqual(["C1", "S1"]);
    expect(found.missed).toEqual([
      { term: "Ana", reason: "several" },
      { term: "zed", reason: "none" },
    ]);
    expect(found.people[0]).not.toHaveProperty("email");
  });

  it("matches the words of a name in any order", async () => {
    const { ctx } = await workspace();
    // Tomás has no handle, so his folded name holds the words only in their own order.
    const found = await resolveDirectory(ctx, ["Ruiz Tomás"]);
    expect(found.people.map((p) => p.slackUserId)).toEqual(["U5"]);
  });

  it("resolves each term on its own, however many rows another term matches", async () => {
    const { ctx, workspaceId } = await workspace();
    await runBatch(db, [
      ...Array.from({ length: 70 }, (_, i) =>
        db.insert(schema.slackGroups).values({
          workspaceId,
          slackId: `SD${i}`,
          kind: "usergroup",
          name: `Design ${String(i).padStart(2, "0")}`,
          handle: `design-${i}`,
          searchName: foldForSearch(`Design ${String(i).padStart(2, "0")}`, `design-${i}`),
        }),
      ),
      db.insert(schema.slackGroups).values({
        workspaceId,
        slackId: "SZ",
        kind: "usergroup",
        name: "Zulu",
        handle: "zulu",
        searchName: foldForSearch("Zulu", "zulu"),
      }),
    ]);
    const found = await resolveDirectory(ctx, ["@design", "@zulu"]);
    expect(found.groups.map((g) => g.slackId)).toEqual(["SZ"]);
    expect(found.missed).toEqual([{ term: "@design", reason: "several" }]);
  });

  it("takes whole words only, a last name included", async () => {
    const { ctx } = await workspace();
    const found = await resolveDirectory(ctx, ["lon", "Ma", "Kask", "torres ana"]);
    expect(found.people.map((p) => p.slackUserId).sort()).toEqual(["U3", "U6"]);
    expect(found.missed).toEqual([
      { term: "lon", reason: "none" },
      { term: "Ma", reason: "none" },
    ]);
  });
});
