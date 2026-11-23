import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import type { Principal } from "../principal";
import { makeLive, workspaceFixture } from "../services/fixtures";
import { createDraft, updateDraft } from "../services/hollers";
import { recordResponse } from "../services/responses";
import { devSlack } from "../services/slack-connection";
import { testDb } from "../test-db";
import { deliveryEnv } from "../test-delivery";
import { buildMcpServer } from "./server";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());

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
  const { env, drain } = deliveryEnv(db, raw);
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
  const slackAfterSends = async () => {
    await drain(ctx.now());
    return devSlack(db, fixture.workspaceId);
  };
  return { ...fixture, ctx, client, callTool, slackAfterSends };
}

const statusOf = async (id: string) =>
  (await db.query.hollers.findFirst({ where: (holler, { eq }) => eq(holler.id, id) }))?.status;

const activityOn = (id: string, action: string) =>
  db.query.activity.findMany({
    where: (row, { and, eq }) => and(eq(row.subjectId, id), eq(row.action, action)),
  });

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
    const { callTool, ctx, slackAfterSends } = await connect("write");
    const holler = await createDraft(ctx, pulse);
    const preview = await callTool("send_holler", { hollerId: holler.id });
    expect(preview.isError).toBeFalsy();
    expect(preview.structuredContent).toMatchObject({
      sent: false,
      preview: { reach: 2, people: ["Person UA", "Person UB"], morePeople: 0, problems: [] },
    });
    expect(typeof preview.structuredContent?.confirm).toBe("string");
    expect(await statusOf(holler.id)).toBe("draft");
    expect((await slackAfterSends()).posted).toEqual([]);
  });

  it("sends with the confirm token from the preview, as the member who granted access", async () => {
    const { callTool, ctx, memberId, slackAfterSends } = await connect("write");
    const holler = await createDraft(ctx, pulse);
    const preview = await callTool("send_holler", { hollerId: holler.id });
    const confirm = preview.structuredContent?.confirm as string;
    const sent = await callTool("send_holler", { hollerId: holler.id, confirm });
    expect(sent.isError, sent.content[0]?.text).toBeFalsy();
    expect(sent.structuredContent).toMatchObject({
      sent: true,
      holler: { id: holler.id, status: "live" },
    });
    const invites = (await slackAfterSends()).posted.map((m) => `${m.channel}: ${m.text}`);
    expect(invites.sort()).toEqual([
      "UA: Person ULEAD sent you a Holler: How was your week?",
      "UB: Person ULEAD sent you a Holler: How was your week?",
    ]);
    expect(await activityOn(holler.id, "holler.sent")).toEqual([
      expect.objectContaining({ via: "mcp", memberId, credentialId: "client-1" }),
    ]);
  });

  it("refuses a token once the Holler changed after the preview", async () => {
    const { callTool, ctx, now, slackAfterSends } = await connect("write");
    const holler = await createDraft(ctx, pulse);
    const preview = await callTool("send_holler", { hollerId: holler.id });
    const confirm = preview.structuredContent?.confirm as string;
    const later = { ...ctx, now: () => new Date(now.getTime() + 1000) };
    await updateDraft(later, holler.id, { ...pulse, title: "Something else" });
    const sent = await callTool("send_holler", { hollerId: holler.id, confirm });
    expect(sent.isError).toBe(true);
    expect(sent.content[0]?.text).toMatch(/out of date/);
    expect(await statusOf(holler.id)).toBe("draft");
    expect((await slackAfterSends()).posted).toEqual([]);
  });

  it("refuses a token made for another Holler", async () => {
    const { callTool, ctx, slackAfterSends } = await connect("write");
    const one = await createDraft(ctx, pulse);
    const other = await createDraft(ctx, pulse);
    const preview = await callTool("send_holler", { hollerId: one.id });
    const confirm = preview.structuredContent?.confirm as string;
    const sent = await callTool("send_holler", { hollerId: other.id, confirm });
    expect(sent.isError).toBe(true);
    expect([await statusOf(one.id), await statusOf(other.id)]).toEqual(["draft", "draft"]);
    expect((await slackAfterSends()).posted).toEqual([]);
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

describe("a live Holler", () => {
  it("is reminded and closed by its own tools, as the member who granted access", async () => {
    const { callTool, ctx, memberId, slackAfterSends } = await connect("write");
    const holler = await createDraft(ctx, {
      ...pulse,
      audience: { people: ["UA"], groups: [], everyone: false },
    });
    const preview = await callTool("send_holler", { hollerId: holler.id });
    const confirm = preview.structuredContent?.confirm as string;
    await callTool("send_holler", { hollerId: holler.id, confirm });
    const slack = await slackAfterSends();

    const reminded = await callTool("send_reminder", { hollerId: holler.id });
    expect(reminded.isError, reminded.content[0]?.text).toBeFalsy();
    expect(await statusOf(holler.id)).toBe("live");
    await slackAfterSends();
    expect(slack.posted.slice(1).map((m) => [m.channel, m.text])).toEqual([
      ["UA", "A reminder: Person ULEAD still needs your answer to How was your week?"],
    ]);

    const closed = await callTool("close_holler", { hollerId: holler.id });
    expect(closed.structuredContent).toMatchObject({ id: holler.id, status: "closed" });
    expect(await statusOf(holler.id)).toBe("closed");
    for (const action of ["holler.reminded", "holler.closed"]) {
      expect(await activityOn(holler.id, action)).toEqual([
        expect.objectContaining({ via: "mcp", memberId, credentialId: "client-1" }),
      ]);
    }
  });

  it("exports its results in the format asked for", async () => {
    const { callTool, ctx, now } = await connect("read");
    const holler = await createDraft(ctx, pulse);
    await makeLive(db, holler.id, ["UA"], now);
    const [question] = holler.questions;
    await recordResponse(ctx, {
      hollerId: holler.id,
      slackUserId: "UA",
      via: "slack_button",
      response: {
        answers: [{ questionId: question?.id ?? "", optionIds: [question?.options[1]?.id ?? ""] }],
      },
    });
    const md = await callTool("export_results", { hollerId: holler.id });
    expect(md.content[0]?.text).toContain("1 of 1 person answered.");
    expect(md.content[0]?.text).toContain("| Great | 1 | 100% |");
    const csv = await callTool("export_results", { hollerId: holler.id, format: "csv" });
    const [header, row] = (csv.content[0]?.text ?? "").split("\r\n");
    expect(header).toContain("How was it?");
    expect(row).toMatch(/Person UA.*Great/);
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
    for (const format of ["csv", "md"]) {
      const exported = await callTool("export_results", { hollerId: holler.id, format });
      expect(exported.isError).toBe(true);
      expect(exported.content[0]?.text).toMatch(/2 more answers/);
    }
  });
});
