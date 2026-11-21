import {
  exportFormatSchema,
  hollerDraftSchema,
  hollerListOutSchema,
  hollerOutSchema,
  listHollersQuerySchema,
  okOutSchema,
  recipientsOutSchema,
  resultsOutSchema,
  sendPreviewOutSchema,
} from "@holler/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../app";
import { closeHoller, remindWaiting, sendHoller } from "../../services/delivery";
import { exportCsv, exportMarkdown } from "../../services/exports";
import { hollerPeople } from "../../services/holler-people";
import {
  copyHoller,
  createDraft,
  deleteDraft,
  getHoller,
  listHollers,
  updateDraft,
} from "../../services/hollers";
import { resultsFor } from "../../services/responses";
import { previewSend } from "../../services/send-preview";
import { requireMember } from "../context";
import { describe, input } from "./http";
import { hollerOut } from "./present";

const tags = ["Hollers"];
const idParam = z.object({ id: z.string().min(1) });
const idempotencyHeader = z.object({
  "idempotency-key": z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[\x21-\x7e]+$/, "Use printable characters without spaces.")
    .optional()
    .describe(
      "A label you choose, unique per Holler. A retry with the same key and body returns the first Holler; the same key with a different body is refused with 409.",
    ),
});

export const v1Hollers = new Hono<AppEnv>()
  .get(
    "/",
    describe({
      tags,
      summary: "List hollers",
      description:
        "`scope=mine` (the default) is what the caller made; `scope=shared` is everything else they can see. Newest change first, at most 200.",
      ok: { schema: hollerListOutSchema, description: "Hollers" },
      errors: [400],
    }),
    input("query", listHollersQuerySchema),
    async (c) => c.json({ hollers: await listHollers(requireMember(c), c.req.valid("query")) }),
  )
  .post(
    "/",
    describe({
      tags,
      summary: "Create a Holler",
      description:
        "Creates a draft. Nothing reaches anyone until you send it. Send an `Idempotency-Key` header so a retried call never makes a second draft.",
      ok: { status: 201, schema: hollerOutSchema, description: "The new draft" },
      errors: [400, 409],
    }),
    input("header", idempotencyHeader),
    input("json", hollerDraftSchema),
    async (c) => {
      const key = c.req.valid("header")["idempotency-key"];
      const holler = await createDraft(requireMember(c), c.req.valid("json"), {
        idempotencyKey: key,
      });
      const replayed = "replayed" in holler;
      if (replayed) c.header("idempotent-replayed", "true");
      return c.json(hollerOut(holler), replayed ? 200 : 201);
    },
  )
  .get(
    "/:id",
    describe({
      tags,
      summary: "Get a Holler",
      ok: { schema: hollerOutSchema, description: "The Holler and its questions" },
      errors: [404],
    }),
    input("param", idParam),
    async (c) => c.json(hollerOut(await getHoller(requireMember(c), c.req.valid("param").id))),
  )
  .put(
    "/:id",
    describe({
      tags,
      summary: "Update a Holler",
      description:
        "Replaces a draft or scheduled Holler's fields and questions. Send a question's or option's `id` back to keep it; leave one out to remove it. The mode may change until it is sent (a chase keeps no questions), and a sent Holler cannot change.",
      ok: { schema: hollerOutSchema, description: "The saved Holler" },
      errors: [400, 404, 409],
    }),
    input("param", idParam),
    input("json", hollerDraftSchema),
    async (c) =>
      c.json(
        hollerOut(
          await updateDraft(requireMember(c), c.req.valid("param").id, c.req.valid("json")),
        ),
      ),
  )
  .delete(
    "/:id",
    describe({
      tags,
      summary: "Delete a draft",
      description:
        "Deletes a draft you made. A scheduled or sent Holler cannot be deleted; close a sent one instead.",
      ok: { schema: okOutSchema, description: "Deleted" },
      errors: [404, 409],
    }),
    input("param", idParam),
    async (c) => {
      await deleteDraft(requireMember(c), c.req.valid("param").id);
      return c.json({ ok: true as const });
    },
  )
  .post(
    "/:id/copy",
    describe({
      tags,
      summary: "Copy a Holler",
      description:
        "Makes a new draft of yours with the same questions, audience and settings, and no send or close time.",
      ok: { status: 201, schema: hollerOutSchema, description: "The new draft" },
      errors: [404],
    }),
    input("param", idParam),
    async (c) =>
      c.json(hollerOut(await copyHoller(requireMember(c), c.req.valid("param").id)), 201),
  )
  .get(
    "/:id/preview",
    describe({
      tags,
      summary: "Preview a send",
      description:
        "Who a send would reach, when it would close, and every problem that stops it. Sends nothing.",
      ok: { schema: sendPreviewOutSchema, description: "The preview" },
      errors: [404, 409],
    }),
    input("param", idParam),
    async (c) => c.json(await previewSend(requireMember(c), c.req.valid("param").id)),
  )
  .post(
    "/:id/send",
    describe({
      tags,
      summary: "Send a Holler",
      description:
        "Sends it now, or schedules it when it has a `sendAt`. This reaches real people and cannot be undone. A draft with problems is refused with 400 naming the field.",
      ok: { schema: hollerOutSchema, description: "The Holler, now live or scheduled" },
      errors: [400, 402, 404, 409, 503],
    }),
    input("param", idParam),
    async (c) =>
      c.json(hollerOut(await sendHoller(requireMember(c), c.env, c.req.valid("param").id))),
  )
  .post(
    "/:id/close",
    describe({
      tags,
      summary: "Close a Holler",
      description: "Stops taking answers now, before its close time.",
      ok: { schema: hollerOutSchema, description: "The closed Holler" },
      errors: [404, 409, 503],
    }),
    input("param", idParam),
    async (c) =>
      c.json(hollerOut(await closeHoller(requireMember(c), c.env, c.req.valid("param").id))),
  )
  .post(
    "/:id/remind",
    describe({
      tags,
      summary: "Send a reminder",
      description: "Reminds everyone who has not answered yet, now.",
      ok: { schema: hollerOutSchema, description: "The Holler" },
      errors: [404, 409, 410, 503],
    }),
    input("param", idParam),
    async (c) =>
      c.json(hollerOut(await remindWaiting(requireMember(c), c.env, c.req.valid("param").id))),
  )
  .get(
    "/:id/people",
    describe({
      tags,
      summary: "Who answered",
      description:
        "Everyone the Holler went to and whether they answered. On an anonymous Holler you see how many answered, never who: every `answered` is null and the list is in name order.",
      ok: { schema: recipientsOutSchema, description: "Recipients, answered first" },
      errors: [404],
    }),
    input("param", idParam),
    async (c) => c.json(await hollerPeople(requireMember(c), c.req.valid("param").id)),
  )
  .get(
    "/:id/results",
    describe({
      tags,
      summary: "Get results",
      description:
        "Counts per option, scale averages and text answers. An anonymous Holler's results stay `gated` until five people answer.",
      ok: { schema: resultsOutSchema, description: "Results" },
      errors: [404],
    }),
    input("param", idParam),
    async (c) => {
      const ctx = requireMember(c);
      const { id } = c.req.valid("param");
      // getHoller throws not_found unless the caller may see it.
      await getHoller(ctx, id);
      return c.json(await resultsFor(ctx, id));
    },
  )
  .get(
    "/:id/export",
    describe({
      tags,
      summary: "Export results",
      description:
        "`format=csv` for spreadsheets, `format=md` for docs. The same anonymity gate as results applies.",
      ok: { description: "The export file", media: ["text/csv", "text/markdown"] },
      errors: [400, 404, 503],
    }),
    input("param", idParam),
    input("query", z.object({ format: exportFormatSchema.default("csv") })),
    async (c) => {
      const ctx = requireMember(c);
      const { id } = c.req.valid("param");
      const { format } = c.req.valid("query");
      const body = format === "csv" ? await exportCsv(ctx, id) : await exportMarkdown(ctx, id);
      return c.body(body, 200, {
        "content-type":
          format === "csv" ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="holler-${id}.${format}"`,
      });
    },
  );
