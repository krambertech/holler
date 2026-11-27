import {
  directoryOutSchema,
  exportFormatSchema,
  hollerDraftSchema,
  hollerListOutSchema,
  hollerOutSchema,
  listHollersQuerySchema,
  okOutSchema,
  recipientsOutSchema,
  repeatInputSchema,
  resultsOutSchema,
  sendPreviewOutSchema,
} from "@holler/core";
import { type CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Bindings } from "../env";
import type { Principal } from "../principal";
import { hollerOut } from "../routes/v1/present";
import type { ServiceContext } from "../services/context";
import { ServiceError } from "../services/context";
import { closeHoller, remindWaiting, sendHoller } from "../services/delivery";
import { searchDirectory } from "../services/directory";
import { exportCsv, exportMarkdown } from "../services/exports";
import { hollerPeople } from "../services/holler-people";
import {
  copyHoller,
  createDraft,
  deleteDraft,
  getHoller,
  listHollers,
  updateDraft,
} from "../services/hollers";
import { resultsFor } from "../services/responses";
import { changeRepeat, stopRepeating } from "../services/rounds";
import { checkSendConfirmToken, previewSend, sendConfirmToken } from "../services/send-preview";

/** What one MCP request runs as. Built from the verified access token, never from the body. */
export interface McpPrincipal {
  principal: Principal;
  ctx: ServiceContext;
  env: Bindings;
  /** Named in the step-up challenge when a read-only connection tries to write. */
  resourceMetadataUrl: string;
}

const INSTRUCTIONS = `Holler asks a team something in Slack, reminds the people who have not answered, and shows the results. One ask is a Holler. You act as one member of one Slack workspace.

A Holler has a mode: pulse (one or two quick questions), survey (up to 30 questions) or chase (a link to a form somewhere else, with no questions). The mode may change until it is sent. Each question has a type (single, multi, text, number, person) and a style (plain, scale, binary); a choice question has 2 to 100 options, and scale options carry a score. A plain choice question may add Other (allowOther), multiple choice and person questions may have a pick limit (maxChoices), and a choice question may ask a follow-up note. get_holler's problems list what still stops a send, each with its field.

To make one: find the audience with find_people, then create_holler, which saves a draft and reaches nobody. Edit it with update_holler, sending back the ids of the questions and options you keep. copy_holler starts a new draft from an existing Holler; delete_draft removes a draft that was never sent.

Sending reaches real people in Slack and cannot be undone, so it takes two calls. Call send_holler with only the hollerId: it sends nothing, and returns who it would reach and a confirm token. Show that to the person in your own words, and call send_holler again with the token only after they agree. Any edit in between makes the token stale.

get_holler shows a Holler with who answered, who is waiting and its results. An anonymous Holler's results stay gated until five people answer; never try to work out who said what.`;

/**
 * A fresh server per request. Stateless: every tool calls the same services the web app and
 * the REST API call, with `via: "mcp"`, so the same rules hold and every write lands in Activity.
 */
export function buildMcpServer(mcp: McpPrincipal): McpServer {
  const server = new McpServer(
    { name: "holler", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );
  const { ctx } = mcp;
  const run = (fn: () => Promise<CallToolResult>) => runTool(fn, mcp);
  const write = (fn: () => Promise<CallToolResult>) =>
    run(async () => (mcp.principal.scope === "write" ? fn() : readOnlyFailure(mcp)));

  server.registerTool(
    "list_hollers",
    {
      title: "List hollers",
      description:
        "Hollers this member made (scope mine, the default) or can see (scope shared), newest change first. Filter by status, mode, tag or a word in the title.",
      inputSchema: listHollersQuerySchema,
      outputSchema: hollerListOutSchema,
      ...readTool,
    },
    (query) => run(async () => result({ hollers: await listHollers(ctx, query) })),
  );

  server.registerTool(
    "get_holler",
    {
      title: "Get a Holler",
      description:
        "One Holler with its questions, who it went to, who answered and who is waiting, and its results. results is null until it is sent; on an anonymous Holler it is gated until five people answer.",
      inputSchema: z.object({ hollerId: z.string().min(1) }),
      outputSchema: z.object({
        holler: hollerOutSchema,
        people: recipientsOutSchema,
        results: resultsOutSchema.nullable(),
      }),
      ...readTool,
    },
    ({ hollerId }) =>
      run(async () => {
        const holler = await getHoller(ctx, hollerId);
        const sent = holler.status === "live" || holler.status === "closed";
        const [people, results] = await Promise.all([
          hollerPeople(ctx, hollerId),
          sent ? resultsFor(ctx, hollerId) : Promise.resolve(null),
        ]);
        return result({ holler: hollerOut(holler), people, results });
      }),
  );

  server.registerTool(
    "get_results",
    {
      title: "Get results",
      description:
        "A sent Holler's results: counts per option, scale averages and text answers. An anonymous Holler's results stay gated until five people answer.",
      inputSchema: z.object({ hollerId: z.string().min(1) }),
      outputSchema: resultsOutSchema,
      ...readTool,
    },
    ({ hollerId }) =>
      run(async () => {
        await getHoller(ctx, hollerId);
        return result(await resultsFor(ctx, hollerId));
      }),
  );

  server.registerTool(
    "find_people",
    {
      title: "Find people and groups",
      description:
        "Search the workspace's people, Slack user groups and channels by name. Put people's slackUserId in audience.people and groups' slackId in audience.groups.",
      inputSchema: z.object({ query: z.string().max(100).default("") }),
      outputSchema: directoryOutSchema,
      ...readTool,
    },
    ({ query }) => run(async () => result(await searchDirectory(ctx, query))),
  );

  server.registerTool(
    "create_holler",
    {
      title: "Create a Holler",
      description: "Save a new draft. It reaches nobody until send_holler. Needs write access.",
      inputSchema: draftInput,
      outputSchema: hollerOutSchema,
      ...writeTool({ idempotent: false }),
    },
    (draft) => write(async () => result(hollerOut(await createDraft(ctx, draft)))),
  );

  server.registerTool(
    "update_holler",
    {
      title: "Update a Holler",
      description:
        "Replace a draft or scheduled Holler's fields and questions. Send back the id of every question and option you keep; one without an id is new, one left out is removed. The mode may change until it is sent; a chase keeps no questions. Needs write access.",
      inputSchema: draftInput.extend({ hollerId: z.string().min(1) }),
      outputSchema: hollerOutSchema,
      ...writeTool({ idempotent: true, overwrites: true }),
    },
    ({ hollerId, ...draft }) =>
      write(async () => result(hollerOut(await updateDraft(ctx, hollerId, draft)))),
  );

  server.registerTool(
    "copy_holler",
    {
      title: "Copy a Holler",
      description:
        "Start a new draft with the same questions, audience and settings as a Holler this member can see, with no send or close time. It reaches nobody. Needs write access.",
      inputSchema: z.object({ hollerId: z.string().min(1) }),
      outputSchema: hollerOutSchema,
      ...writeTool({ idempotent: false }),
    },
    ({ hollerId }) => write(async () => result(hollerOut(await copyHoller(ctx, hollerId)))),
  );

  server.registerTool(
    "delete_draft",
    {
      title: "Delete a draft",
      description:
        "Delete a draft this member made. A scheduled or sent Holler cannot be deleted. There is no undo, so confirm with the person first. Needs write access.",
      inputSchema: z.object({ hollerId: z.string().min(1) }),
      outputSchema: okOutSchema,
      ...writeTool({ idempotent: true, overwrites: true }),
    },
    ({ hollerId }) =>
      write(async () => {
        await deleteDraft(ctx, hollerId);
        return result({ ok: true });
      }),
  );

  server.registerTool(
    "send_holler",
    {
      title: "Send a Holler",
      description:
        "Two calls. Without confirm, sends nothing and returns who it would reach, any problems, and a confirm token. After the person agrees, call again with that token to send, or to schedule it when it has a sendAt. It reaches real people and cannot be undone. Needs write access.",
      inputSchema: z.object({
        hollerId: z.string().min(1),
        confirm: z
          .string()
          .optional()
          .describe("The token from the preview call. Leave it out to preview."),
      }),
      outputSchema: sendOut,
      ...writeTool({ idempotent: false, overwrites: true, openWorld: true }),
    },
    ({ hollerId, confirm }) =>
      write(async () => {
        const secret = mcp.env.BETTER_AUTH_SECRET;
        if (!confirm) {
          const preview = await previewSend(ctx, hollerId);
          const ready = preview.problems.length === 0;
          return result({
            sent: false,
            preview,
            confirm: ready ? await sendConfirmToken(ctx, secret, hollerId) : null,
            next: ready
              ? "Tell the person who this reaches and when it closes. Send only after they agree, by calling send_holler again with confirm."
              : "Fix the problems with update_holler, then preview again.",
          });
        }
        await checkSendConfirmToken(ctx, secret, hollerId, confirm);
        const holler = await sendHoller(ctx, mcp.env, hollerId);
        return result({ sent: true, holler: hollerOut(holler) });
      }),
  );

  server.registerTool(
    "close_holler",
    {
      title: "Close a Holler",
      description: "Stop taking answers now, before its close time. Needs write access.",
      inputSchema: z.object({ hollerId: z.string().min(1) }),
      outputSchema: hollerOutSchema,
      ...writeTool({ idempotent: true, overwrites: true }),
    },
    ({ hollerId }) =>
      write(async () => result(hollerOut(await closeHoller(ctx, mcp.env, hollerId)))),
  );

  server.registerTool(
    "stop_repeating",
    {
      title: "Stop a pulse repeating",
      description:
        "Stop a repeating pulse after the rounds already sent, and delete its next round, which has not gone out. Needs write access.",
      inputSchema: z.object({ hollerId: z.string().min(1) }),
      outputSchema: hollerOutSchema,
      ...writeTool({ idempotent: true, overwrites: true }),
    },
    ({ hollerId }) => write(async () => result(hollerOut(await stopRepeating(ctx, hollerId)))),
  );

  server.registerTool(
    "change_repeat",
    {
      title: "Change how often a pulse repeats",
      description:
        "Repeat a pulse every week or every fortnight from now on, and move its next round, which has not gone out, to match. Rounds already sent stay as they are. Needs write access.",
      inputSchema: z.object({
        hollerId: z.string().min(1),
        repeat: repeatInputSchema.shape.repeat,
      }),
      outputSchema: hollerOutSchema,
      ...writeTool({ idempotent: true, overwrites: true }),
    },
    ({ hollerId, repeat }) =>
      write(async () => result(hollerOut(await changeRepeat(ctx, hollerId, repeat)))),
  );

  server.registerTool(
    "send_reminder",
    {
      title: "Send a reminder",
      description:
        "Remind everyone who has not answered a live Holler, now, in Slack. Needs write access.",
      inputSchema: z.object({ hollerId: z.string().min(1) }),
      outputSchema: hollerOutSchema,
      ...writeTool({ idempotent: false, openWorld: true }),
    },
    ({ hollerId }) =>
      write(async () => result(hollerOut(await remindWaiting(ctx, mcp.env, hollerId)))),
  );

  server.registerTool(
    "export_results",
    {
      title: "Export results",
      description:
        "A Holler's results as CSV for spreadsheets or Markdown for docs. The same anonymity gate as results applies.",
      inputSchema: z.object({
        hollerId: z.string().min(1),
        format: exportFormatSchema.default("md"),
      }),
      ...readTool,
    },
    ({ hollerId, format }) =>
      run(async () => {
        const text =
          format === "csv" ? await exportCsv(ctx, hollerId) : await exportMarkdown(ctx, hollerId);
        return { content: [{ type: "text", text }] };
      }),
  );

  return server;
}

/** The draft as a tool takes it: JSON Schema has no Date, so sendAt and closesAt are ISO strings. */
const draftInput = hollerDraftSchema.extend({
  sendAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .default(null)
    .describe("When to send, as an ISO time. Null sends as soon as it is confirmed."),
  closesAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .default(null)
    .describe("A fixed close time, as an ISO time. Null closes it closeAfterHours after sending."),
});

const sendOut = z.object({
  sent: z.boolean(),
  preview: sendPreviewOutSchema.optional(),
  confirm: z.string().nullable().optional(),
  next: z.string().optional(),
  holler: hollerOutSchema.optional(),
});

const readTool = {
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: { securitySchemes: [{ type: "oauth2", scopes: ["read"] }] },
};

/** openWorld: the tool reaches people in Slack. overwrites: there is no undo. */
function writeTool({
  idempotent,
  overwrites = false,
  openWorld = false,
}: {
  idempotent: boolean;
  overwrites?: boolean;
  openWorld?: boolean;
}) {
  return {
    annotations: {
      readOnlyHint: false,
      destructiveHint: overwrites,
      idempotentHint: idempotent,
      openWorldHint: openWorld,
    },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["write"] }] },
  };
}

/** A ServiceError speaks to the person; any other error may carry SQL and workspace data. */
async function runTool(
  fn: () => Promise<CallToolResult>,
  mcp: McpPrincipal,
): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ServiceError) return failure(error.message);
    console.error("MCP tool failed", {
      workspace: mcp.ctx.workspaceId,
      error: error instanceof Error ? error.name : typeof error,
    });
    return failure("Holler could not finish this just now. Try again in a moment.");
  }
}

/** Clients that understand `mcp/www_authenticate` treat this as a step-up challenge. */
function readOnlyFailure(mcp: McpPrincipal): CallToolResult {
  const message =
    "This connection can only read. Ask the person to connect again and leave write access on.";
  const challenge = [
    `resource_metadata="${mcp.resourceMetadataUrl}"`,
    `error="insufficient_scope"`,
    `scope="read write offline_access"`,
    `error_description="${message}"`,
  ].join(", ");
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    _meta: { "mcp/www_authenticate": [`Bearer ${challenge}`] },
  };
}

function result(structured: object): CallToolResult {
  // Dates become ISO strings here, so the structured content matches the output schema.
  const plain = JSON.parse(JSON.stringify(structured)) as Record<string, unknown>;
  return {
    content: [{ type: "text", text: JSON.stringify(plain, null, 2) }],
    structuredContent: plain,
  };
}

function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}
