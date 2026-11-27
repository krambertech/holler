import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import type { Bindings } from "../env";
import { testEnv } from "./v1/test-env";

/** The dev routes the verify skill stands on: reset, read back, let time pass, answer. */

let env: Bindings;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await testEnv()));
afterAll(() => dispose());

const origin = "http://localhost:5280";

function request(path: string, init: RequestInit = {}, cookie = "") {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return app.request(`${origin}${path}`, { ...init, headers }, env);
}

function post(path: string, body: unknown, cookie: string) {
  return request(
    path,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    cookie,
  );
}

async function signIn(query: string): Promise<string> {
  const response = await request(`/api/dev/sign-in?${query}`);
  expect(response.status).toBe(302);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

interface State {
  persona: string | null;
  member: { role: string } | null;
  hollers: {
    id: string;
    title: string;
    status: string;
    closesAt: string | null;
    answered: number;
    waiting: string[];
  }[];
  activity: { action: string; via: string; subjectId: string }[];
}

async function state(cookie: string): Promise<State> {
  const response = await request("/api/dev/state", {}, cookie);
  expect(response.status).toBe(200);
  return (await response.json()) as State;
}

const week = (s: State) => {
  const holler = s.hollers.find((h) => h.title === "How was your week?" && h.status === "live");
  if (!holler) throw new Error("the seeded live weekly pulse is missing");
  return holler;
};

describe("dev routes", () => {
  it("reports the signed-in persona's seeded workspace", async () => {
    const s = await state(await signIn("as=lead&reset=1"));
    expect(s.persona).toBe("lead");
    expect(s.member?.role).toBe("owner");
    expect(s.hollers.map((h) => h.status).sort()).toEqual([
      "closed",
      "closed",
      "closed",
      "live",
      "live",
      "live",
      "scheduled",
      "scheduled",
    ]);
    expect(week(s)).toMatchObject({ answered: 7 });
  });

  it("answers as a waiting recipient and records it", async () => {
    const cookie = await signIn("as=lead&reset=1");
    const holler = week(await state(cookie));
    const slackUserId = holler.waiting[0];
    const detail = (await (await request(`/api/hollers/${holler.id}`, {}, cookie)).json()) as {
      questions: { id: string; type: string; options: { id: string }[] }[];
    };
    const answers = detail.questions.map((q) =>
      q.type === "text"
        ? { questionId: q.id, text: "Nothing" }
        : { questionId: q.id, optionIds: [q.options[0]?.id ?? ""] },
    );

    const answered = await post(
      "/api/dev/answer",
      { hollerId: holler.id, slackUserId, response: { answers } },
      cookie,
    );
    expect(answered.status, await answered.clone().text()).toBe(201);

    const after = week(await state(cookie));
    expect(after.answered).toBe(8);
    expect(after.waiting).not.toContain(slackUserId);

    const again = await post(
      "/api/dev/answer",
      { hollerId: holler.id, slackUserId, response: { answers } },
      cookie,
    );
    expect(again.status).toBe(409);
  });

  it("closes a live holler once a tick runs past its close time", async () => {
    const cookie = await signIn("as=lead&reset=1");
    const holler = week(await state(cookie));
    const at = new Date(new Date(holler.closesAt ?? "").getTime() + 60_000).toISOString();

    const tick = await post("/api/dev/tick", { at }, cookie);
    expect(await tick.json()).toMatchObject({ at, closed: expect.arrayContaining([holler.id]) });

    const after = await state(cookie);
    expect(after.hollers.find((h) => h.id === holler.id)?.status).toBe("closed");
    expect(after.activity).toContainEqual(
      expect.objectContaining({ action: "holler.closed", via: "system", subjectId: holler.id }),
    );
  });

  it("puts the seed back with reset=1", async () => {
    const cookie = await signIn("as=lead&reset=1");
    const holler = week(await state(cookie));
    const closesAt = new Date(holler.closesAt ?? "").getTime();
    await post("/api/dev/tick", { at: new Date(closesAt + 60_000).toISOString() }, cookie);
    const closed = await state(cookie);
    expect(() => week(closed)).toThrow();
    const s = await state(await signIn("as=lead&reset=1"));
    expect(week(s)).toMatchObject({ status: "live", answered: 7 });
    expect(s.activity).toEqual([]);
  });

  it("sends /holler as Slack would, signed, from the persona it names", async () => {
    const cookie = await signIn("as=lead&reset=1");
    const response = await post(
      "/api/dev/slack",
      { path: "commands", as: "U0LEAD", text: "results" },
      cookie,
    );
    const reply = (await response.json()) as { status: number; body: { text: string } };
    expect(reply.status).toBe(200);
    expect(reply.body.text).toMatch(/^You have \d+ live hollers?\.$/);
    const help = await post("/api/dev/slack", { path: "commands", as: "U0MK", text: "" }, cookie);
    expect(((await help.json()) as { body: { text: string } }).body.text).toMatch(/sign in/);
  });

  it("refuses state without a session", async () => {
    expect((await request("/api/dev/state")).status).toBe(403);
  });

  it("hides every dev route without the key when a preview sets one", async () => {
    const keyed = { ...env, DEV_ROUTES_KEY: "preview-key" } as Bindings;
    const signIn = (headers: HeadersInit) =>
      app.request(`${origin}/api/dev/sign-in?as=lead`, { headers }, keyed);
    expect((await signIn({})).status).toBe(404);
    expect((await signIn({ "x-holler-dev-key": "wrong-key!!" })).status).toBe(404);
    expect((await signIn({ "x-holler-dev-key": "preview-key" })).status).toBe(302);
  });
});
