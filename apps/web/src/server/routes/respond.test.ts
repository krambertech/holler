import type { RespondForm } from "@holler/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import type { Bindings } from "../env";
import { testEnv } from "./v1/test-env";

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

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function signIn(): Promise<string> {
  const response = await request("/api/dev/sign-in?as=lead&reset=1");
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function webHoller() {
  const cookie = await signIn();
  const created = await request(
    "/api/hollers",
    json({
      mode: "survey",
      title: "Offsite",
      audience: { people: ["U0LEAD", "U0MK"], groups: [], everyone: false },
      questions: [
        {
          type: "single",
          prompt: "Where?",
          options: [{ label: "Lisbon" }, { label: "Tallinn" }],
          followUp: { prompt: "Why there?", onlyAfter: [1] },
        },
      ],
    }),
    cookie,
  );
  expect(created.status, await created.clone().text()).toBe(201);
  const holler = (await created.json()) as { id: string };
  const sent = await request(`/api/hollers/${holler.id}/send`, { method: "POST" }, cookie);
  expect(sent.status, await sent.clone().text()).toBe(200);
  const link = await request(`/api/dev/respond-link?holler=${holler.id}&as=U0LEAD`, {}, cookie);
  const { url } = (await link.json()) as { url: string };
  const search = new URL(url, origin).searchParams;
  return { id: holler.id, url, u: search.get("u") ?? "", s: search.get("s") ?? "" };
}

describe("/api/respond", () => {
  it("opens the form from the signed link alone, and never lets it be cached", async () => {
    const { id, u, s } = await webHoller();
    const response = await request(`/api/respond/${id}?u=${u}&s=${s}`);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const form = (await response.json()) as RespondForm;
    expect(form.state).toBe("open");
  });

  it("refuses a changed link with a message that says what to do", async () => {
    const { id, s } = await webHoller();
    const response = await request(`/api/respond/${id}?u=U0MK&s=${s}`);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "forbidden", message: expect.stringMatching(/Open it again/) },
    });
  });

  it("records the answers and comes back answered", async () => {
    const { id, u, s } = await webHoller();
    const open = (await (await request(`/api/respond/${id}?u=${u}&s=${s}`)).json()) as RespondForm;
    if (open.state !== "open") throw new Error("expected an open form");
    const [where] = open.questions;
    const tallinn = where?.options[1]?.id ?? "";
    const response = await request(
      `/api/respond/${id}`,
      json({
        u,
        s,
        response: {
          answers: [{ questionId: where?.id, optionIds: [tallinn], note: "The sauna" }],
        },
      }),
    );
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({ state: "answered" });
  });

  it("puts a refused answer's message on its question", async () => {
    const { id, u, s } = await webHoller();
    const open = (await (await request(`/api/respond/${id}?u=${u}&s=${s}`)).json()) as RespondForm;
    if (open.state !== "open") throw new Error("expected an open form");
    const [where] = open.questions;
    const lisbon = where?.options[0]?.id ?? "";
    const response = await request(
      `/api/respond/${id}`,
      json({
        u,
        s,
        response: { answers: [{ questionId: where?.id, optionIds: [lisbon], note: "Why not" }] },
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid", field: where?.id } });
  });
});
