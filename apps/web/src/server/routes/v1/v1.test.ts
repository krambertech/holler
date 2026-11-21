import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../app";
import type { Db } from "../../db";
import type { Bindings } from "../../env";
import { createApiKey } from "../../services/api-keys";
import { makeLive, workspaceFixture } from "../../services/fixtures";
import { createDraft } from "../../services/hollers";
import { recordResponse } from "../../services/responses";
import { testEnv } from "./test-env";

// Slack delivery is another area's; these tests check the API calls it, as the member, via "api".
vi.mock("../../services/delivery", async () => {
  const { getHoller } = await import("../../services/hollers");
  const echo = vi.fn((ctx, _env, id: string) => getHoller(ctx, id));
  return { sendHoller: echo, closeHoller: echo, remindWaiting: echo };
});
const delivery = vi.mocked(await import("../../services/delivery"));

let env: Bindings;
let db: Db;
let auth: Awaited<ReturnType<typeof testEnv>>["auth"];
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, db, auth, dispose } = await testEnv()));
afterAll(() => dispose());
beforeEach(() => vi.clearAllMocks());

const pulse = {
  mode: "pulse" as const,
  title: "How was your week?",
  audience: { people: ["UA"], groups: [], everyone: false },
  questions: [
    {
      type: "single" as const,
      prompt: "How was it?",
      options: [{ label: "Fine" }, { label: "Great" }],
    },
  ],
};

async function keyFor(scope: "read" | "write") {
  const fixture = await workspaceFixture(db);
  const { key, id } = await createApiKey(fixture.ctx, auth, { name: `${scope} key`, scope });
  return { ...fixture, key, keyId: id };
}

function call(path: string, key: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (key) headers.set("authorization", `Bearer ${key}`);
  if (init.body) headers.set("content-type", "application/json");
  return app.request(`http://localhost:5280${path}`, { ...init, headers }, env);
}

describe("authentication", () => {
  it("refuses a call with no credential in the API's error shape", async () => {
    const response = await call("/api/v1/hollers", null);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toMatch(/Settings/);
  });

  it("refuses a key that does not exist", async () => {
    const response = await call("/api/v1/hollers", "hlr_notarealkey");
    expect(response.status).toBe(401);
  });

  it("accepts the key in x-api-key too", async () => {
    const { key } = await keyFor("read");
    const response = await app.request(
      "http://localhost:5280/api/v1/me",
      { headers: { "x-api-key": key } },
      env,
    );
    expect(response.status).toBe(200);
    const me = (await response.json()) as { credential: { via: string; scope: string } };
    expect(me.credential).toEqual({ via: "api", scope: "read" });
  });

  it("stops working once the key is revoked", async () => {
    const { key, keyId, ctx } = await keyFor("read");
    const { revokeApiKey } = await import("../../services/api-keys");
    await revokeApiKey(ctx, keyId);
    expect((await call("/api/v1/hollers", key)).status).toBe(401);
  });
});

describe("scopes", () => {
  it("lets a read key list and read but not write", async () => {
    const { key, ctx } = await keyFor("read");
    const holler = await createDraft(ctx, pulse);
    expect((await call("/api/v1/hollers", key)).status).toBe(200);
    expect((await call(`/api/v1/hollers/${holler.id}`, key)).status).toBe(200);
    const create = await call("/api/v1/hollers", key, {
      method: "POST",
      body: JSON.stringify(pulse),
    });
    expect(create.status).toBe(403);
    const send = await call(`/api/v1/hollers/${holler.id}/send`, key, { method: "POST" });
    expect(send.status).toBe(403);
    expect(delivery.sendHoller).not.toHaveBeenCalled();
  });

  it("lets a write key create, and records it as made through the API", async () => {
    const { key } = await keyFor("write");
    const response = await call("/api/v1/hollers", key, {
      method: "POST",
      body: JSON.stringify(pulse),
    });
    expect(response.status).toBe(201);
    const holler = (await response.json()) as { createdVia: string; status: string };
    expect(holler).toMatchObject({ createdVia: "api", status: "draft" });
  });

  it("sends through the delivery service as the key's member", async () => {
    const { key, ctx, memberId, keyId } = await keyFor("write");
    const holler = await createDraft(ctx, pulse);
    const response = await call(`/api/v1/hollers/${holler.id}/send`, key, { method: "POST" });
    expect(response.status).toBe(200);
    expect(delivery.sendHoller).toHaveBeenCalledOnce();
    const [sentCtx, , id] = delivery.sendHoller.mock.calls[0] ?? [];
    expect(id).toBe(holler.id);
    expect(sentCtx?.actor).toMatchObject({ via: "api", memberId, credentialId: keyId });
  });

  it("keeps keys off the web-only routes, whatever their scope", async () => {
    const { key } = await keyFor("write");
    expect((await call("/api/v1/keys", key)).status).toBe(403);
    const make = await call("/api/v1/keys", key, {
      method: "POST",
      body: JSON.stringify({ name: "Another", scope: "write" }),
    });
    expect(make.status).toBe(403);
    expect((await call("/api/v1/connected-apps", key)).status).toBe(403);
  });

  it("acts only in the key's own workspace", async () => {
    const mine = await keyFor("write");
    const theirs = await workspaceFixture(db);
    const elsewhere = await createDraft(theirs.ctx, pulse);
    const response = await call(`/api/v1/hollers/${elsewhere.id}`, mine.key);
    expect(response.status).toBe(404);
  });
});

describe("validation", () => {
  it("names the field at fault", async () => {
    const { key } = await keyFor("write");
    const response = await call("/api/v1/hollers", key, {
      method: "POST",
      body: JSON.stringify({ ...pulse, mode: "poll" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; field?: string } };
    expect(body.error).toMatchObject({ code: "invalid", field: "mode" });
  });
});

describe("Idempotency-Key", () => {
  it("returns the first Holler when a create is retried with the same body", async () => {
    const { key } = await keyFor("write");
    const init = {
      method: "POST",
      headers: { "idempotency-key": "weekly-2026-11-23" },
      body: JSON.stringify(pulse),
    };
    const first = await call("/api/v1/hollers", key, init);
    const again = await call("/api/v1/hollers", key, init);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    const [a, b] = (await Promise.all([first.json(), again.json()])) as { id: string }[];
    expect(b?.id).toBe(a?.id);
  });

  it("refuses the same key with a different body", async () => {
    const { key } = await keyFor("write");
    const headers = { "idempotency-key": "weekly-2026-11-30" };
    await call("/api/v1/hollers", key, { method: "POST", headers, body: JSON.stringify(pulse) });
    const changed = await call("/api/v1/hollers", key, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...pulse, title: "Something else" }),
    });
    expect(changed.status).toBe(409);
    const body = (await changed.json()) as { error: { code: string; field?: string } };
    expect(body.error).toMatchObject({ code: "conflict", field: "Idempotency-Key" });
  });
});

describe("the anonymous gate", () => {
  it("keeps an anonymous Holler's results gated until five people answer", async () => {
    const { key, ctx, now } = await keyFor("read");
    const holler = await createDraft(ctx, { ...pulse, anonymous: true });
    await makeLive(db, holler.id, ["UA", "UB", "UC", "UD", "UE"], now);
    const [question] = holler.questions;
    const answer = (slackUserId: string) =>
      recordResponse(ctx, {
        hollerId: holler.id,
        slackUserId,
        via: "slack_button",
        response: {
          answers: [
            { questionId: question?.id ?? "", optionIds: [question?.options[0]?.id ?? ""] },
          ],
        },
      });
    for (const person of ["UA", "UB", "UC", "UD"]) await answer(person);

    const gated = await call(`/api/v1/hollers/${holler.id}/results`, key);
    expect(await gated.json()).toEqual({ state: "gated", responseCount: 4, needed: 1 });

    await answer("UE");
    const open = (await (await call(`/api/v1/hollers/${holler.id}/results`, key)).json()) as {
      state: string;
      questions: { options: { slackUserIds: string[] }[] }[];
    };
    expect(open.state).toBe("open");
    expect(open.questions[0]?.options[0]?.slackUserIds).toEqual([]);
  });
});

describe("OpenAPI", () => {
  it("documents the public API and nothing else", async () => {
    const response = await app.request("http://localhost:5280/api/openapi.json", {}, env);
    expect(response.status).toBe(200);
    const doc = (await response.json()) as { paths: Record<string, unknown> };
    const paths = Object.keys(doc.paths);
    expect(paths).toContain("/api/v1/hollers");
    expect(paths).toContain("/api/v1/hollers/{id}/results");
    expect(paths.every((path) => path.startsWith("/api/v1/"))).toBe(true);
  });
});
