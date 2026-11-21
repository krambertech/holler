import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db";
import type { Bindings } from "../env";
import type { Principal } from "../principal";
import { makeLive, workspaceFixture } from "../services/fixtures";
import { createDraft, updateDraft } from "../services/hollers";
import { recordResponse } from "../services/responses";
import { testDb } from "../test-db";
import { buildMcpServer } from "./server";

// Slack delivery and exports are other areas'; these tests check the tools call them.
vi.mock("../services/delivery", async () => {
  const { getHoller } = await import("../services/hollers");
  const echo = vi.fn((ctx, _env, id: string) => getHoller(ctx, id));
  return { sendHoller: echo, closeHoller: echo, remindWaiting: echo };
});
vi.mock("../services/exports", () => ({
  exportCsv: vi.fn(async () => "question,option,count\n"),
  exportMarkdown: vi.fn(async () => "# Results\n"),
}));
const delivery = vi.mocked(await import("../services/delivery"));

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());
beforeEach(() => vi.clearAllMocks());

const env = { BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters-long" } as Bindings;

const pulse = {
  mode: "pulse" as const,
  title: "How was your week?",
  audience: { people: ["UA", "UB"], groups: [], everyone: false },
  questions: [
    {
      type: "single" as const,
      prompt: "How was it?",
      options: [{ label: "Fine" }, { label: "Great" }],
    },
  ],
};

/** A connected client for one member, with the scope the person granted. */
async function connect(scope: "read" | "write") {
  const fixture = await workspaceFixture(db);
  const actor = {
    via: "mcp" as const,
    memberId: fixture.memberId,
    slackUserId: "ULEAD",
    credentialId: "client-1",
  };
  const ctx = { ...fixture.ctx, actor };
  const principal: Principal = {
    userId: "user",
    memberId: fixture.memberId,
    workspaceId: fixture.workspaceId,
    slackUserId: "ULEAD",
    role: "owner",
    actor,
    scope,
  };
  const server = buildMcpServer({
    principal,
    ctx,
    env,
    resourceMetadataUrl: "http://localhost:5280/.well-known/oauth-protected-resource/mcp",
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const callTool = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    return result as {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: { type: string; text?: string }[];
      _meta?: Record<string, unknown>;
    };
  };
  return { ...fixture, ctx, client, callTool };
}

describe("tools", () => {
  it("offers the tools the API and MCP area promised", async () => {
    const { client } = await connect("read");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "close_holler",
        "copy_holler",
        "create_holler",
        "delete_draft",
        "export_results",
        "find_people",
        "get_holler",
        "get_results",
        "list_hollers",
        "send_holler",
        "send_reminder",
        "stop_repeating",
        "update_holler",
      ].sort(),
    );
    const send = tools.find((t) => t.name === "send_holler");
    expect(send?.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
  });

  it("creates a draft as the member, recorded as made through MCP", async () => {
    const { callTool } = await connect("write");
    const result = await callTool("create_holler", pulse);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ status: "draft", createdVia: "mcp" });
  });

  it("refuses writes on a read-only connection with a step-up challenge", async () => {
    const { callTool } = await connect("read");
    const result = await callTool("create_holler", pulse);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/can only read/);
    expect(JSON.stringify(result._meta)).toMatch(/insufficient_scope/);
  });

  it("copies a Holler into a new draft and deletes a draft", async () => {
    const { callTool, ctx } = await connect("write");
    const holler = await createDraft(ctx, pulse);
    const copy = await callTool("copy_holler", { hollerId: holler.id });
    expect(copy.structuredContent).toMatchObject({ status: "draft", title: pulse.title });
    expect(copy.structuredContent?.id).not.toBe(holler.id);
    const deleted = await callTool("delete_draft", { hollerId: holler.id });
    expect(deleted.structuredContent).toEqual({ ok: true });
    const gone = await callTool("get_holler", { hollerId: holler.id });
    expect(gone.isError).toBe(true);
  });

  it("shows how many answered an anonymous Holler, never who", async () => {
    const { callTool, ctx, now } = await connect("read");
    const holler = await createDraft(ctx, { ...pulse, anonymous: true });
    await makeLive(db, holler.id, ["UA", "UB"], now);
    const [question] = holler.questions;
    await recordResponse(ctx, {
      hollerId: holler.id,
      slackUserId: "UB",
      via: "slack_button",
      response: {
        answers: [{ questionId: question?.id ?? "", optionIds: [question?.options[0]?.id ?? ""] }],
      },
    });
    const result = await callTool("get_holler", { hollerId: holler.id });
    expect(result.structuredContent?.people).toMatchObject({
      answeredCount: 1,
      waitingCount: 1,
      recipients: [
        { slackUserId: "UA", answered: null },
        { slackUserId: "UB", answered: null },
      ],
    });
  });

  it("finds people for an audience", async () => {
    const { callTool } = await connect("read");
    const result = await callTool("find_people", { query: "person ua" });
    expect(result.structuredContent?.people).toEqual([
      expect.objectContaining({ slackUserId: "UA", name: "Person UA" }),
    ]);
  });
});

describe("sending in two steps", () => {
  it("previews first and sends nothing", async () => {
    const { callTool, ctx } = await connect("write");
    const holler = await createDraft(ctx, pulse);
    const preview = await callTool("send_holler", { hollerId: holler.id });
    expect(preview.isError).toBeFalsy();
    expect(preview.structuredContent).toMatchObject({
      sent: false,
      preview: { reach: 2, people: ["Person UA", "Person UB"], morePeople: 0, problems: [] },
    });
    expect(typeof preview.structuredContent?.confirm).toBe("string");
    expect(delivery.sendHoller).not.toHaveBeenCalled();
  });

  it("sends with the confirm token from the preview", async () => {
    const { callTool, ctx } = await connect("write");
    const holler = await createDraft(ctx, pulse);
    const preview = await callTool("send_holler", { hollerId: holler.id });
    const confirm = preview.structuredContent?.confirm as string;
    const sent = await callTool("send_holler", { hollerId: holler.id, confirm });
    expect(sent.isError).toBeFalsy();
    expect(sent.structuredContent).toMatchObject({ sent: true });
    expect(delivery.sendHoller).toHaveBeenCalledOnce();
    expect(delivery.sendHoller.mock.calls[0]?.[0].actor).toMatchObject({ via: "mcp" });
  });

  it("refuses a token once the Holler changed after the preview", async () => {
    const { callTool, ctx, now } = await connect("write");
    const holler = await createDraft(ctx, pulse);
    const preview = await callTool("send_holler", { hollerId: holler.id });
    const confirm = preview.structuredContent?.confirm as string;
    const later = { ...ctx, now: () => new Date(now.getTime() + 1000) };
    await updateDraft(later, holler.id, { ...pulse, title: "Something else" });
    const sent = await callTool("send_holler", { hollerId: holler.id, confirm });
    expect(sent.isError).toBe(true);
    expect(sent.content[0]?.text).toMatch(/out of date/);
    expect(delivery.sendHoller).not.toHaveBeenCalled();
  });

  it("refuses a token made for another Holler", async () => {
    const { callTool, ctx } = await connect("write");
    const one = await createDraft(ctx, pulse);
    const other = await createDraft(ctx, pulse);
    const preview = await callTool("send_holler", { hollerId: one.id });
    const confirm = preview.structuredContent?.confirm as string;
    const sent = await callTool("send_holler", { hollerId: other.id, confirm });
    expect(sent.isError).toBe(true);
    expect(delivery.sendHoller).not.toHaveBeenCalled();
  });

  it("gives no token while the draft has problems", async () => {
    const { callTool, ctx } = await connect("write");
    const holler = await createDraft(ctx, {
      ...pulse,
      audience: { people: [], groups: [], everyone: false },
    });
    const preview = await callTool("send_holler", { hollerId: holler.id });
    expect(preview.structuredContent).toMatchObject({
      confirm: null,
      preview: { problems: [expect.objectContaining({ field: "audience" })] },
    });
  });
});

describe("the anonymous gate", () => {
  it("keeps results gated in get_holler and get_results until five people answer", async () => {
    const { callTool, ctx, now } = await connect("read");
    const holler = await createDraft(ctx, { ...pulse, anonymous: true });
    await makeLive(db, holler.id, ["UA", "UB", "UC", "UD", "UE"], now);
    const [question] = holler.questions;
    for (const person of ["UA", "UB", "UC"]) {
      await recordResponse(ctx, {
        hollerId: holler.id,
        slackUserId: person,
        via: "slack_button",
        response: {
          answers: [
            { questionId: question?.id ?? "", optionIds: [question?.options[0]?.id ?? ""] },
          ],
        },
      });
    }
    const got = await callTool("get_holler", { hollerId: holler.id });
    expect(got.structuredContent).toMatchObject({
      people: { recipientCount: 5, answeredCount: 3, waitingCount: 2 },
      results: { state: "gated", responseCount: 3, needed: 2 },
    });
    const results = await callTool("get_results", { hollerId: holler.id });
    expect(results.structuredContent).toEqual({ state: "gated", responseCount: 3, needed: 2 });
  });
});
