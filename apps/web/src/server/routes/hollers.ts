import {
  exportFormatSchema,
  hollerDraftSchema,
  listHollersQuerySchema,
  repeatInputSchema,
  viewersInputSchema,
  visibilityInputSchema,
} from "@holler/core";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { closeHoller, remindWaiting, sendHoller } from "../services/delivery";
import { exportCsv, exportMarkdown } from "../services/exports";
import { hollerPeople } from "../services/holler-people";
import {
  copyHoller,
  createDraft,
  deleteDraft,
  getHoller,
  homeCounts,
  listHollers,
  updateDraft,
} from "../services/hollers";
import { resultsFor } from "../services/responses";
import { changeRepeat, listRounds, stopRepeating } from "../services/rounds";
import { previewSend } from "../services/send-preview";
import {
  addViewers,
  getSharing,
  makeReportLink,
  removeViewer,
  setVisibility,
  turnOffReportLink,
} from "../services/sharing";
import { requireMember } from "./context";
import { hollerOut } from "./v1/present";

/**
 * The web app's routes for hollers. A Holler comes back as `HollerOut`, the shape the API and
 * MCP return, so the editor sends its questions back as it got them. The public REST API under
 * /api/v1 mirrors these through the same services; see docs/api.md.
 */
export const hollerRoutes = new Hono<AppEnv>()
  .get("/counts", async (c) => c.json(await homeCounts(requireMember(c))))
  .get("/", sValidator("query", listHollersQuerySchema), async (c) =>
    c.json({ hollers: await listHollers(requireMember(c), c.req.valid("query")) }),
  )
  .post("/", sValidator("json", hollerDraftSchema), async (c) =>
    c.json(hollerOut(await createDraft(requireMember(c), c.req.valid("json"))), 201),
  )
  .get("/:id", async (c) => c.json(hollerOut(await getHoller(requireMember(c), c.req.param("id")))))
  .put("/:id", sValidator("json", hollerDraftSchema), async (c) =>
    c.json(hollerOut(await updateDraft(requireMember(c), c.req.param("id"), c.req.valid("json")))),
  )
  .delete("/:id", async (c) => {
    await deleteDraft(requireMember(c), c.req.param("id"));
    return c.json({ ok: true as const });
  })
  .post("/:id/copy", async (c) =>
    c.json(hollerOut(await copyHoller(requireMember(c), c.req.param("id"))), 201),
  )
  .get("/:id/preview", async (c) => c.json(await previewSend(requireMember(c), c.req.param("id"))))
  .post("/:id/send", async (c) =>
    c.json(hollerOut(await sendHoller(requireMember(c), c.env, c.req.param("id")))),
  )
  .post("/:id/close", async (c) =>
    c.json(hollerOut(await closeHoller(requireMember(c), c.env, c.req.param("id")))),
  )
  .get("/:id/rounds", async (c) => c.json(await listRounds(requireMember(c), c.req.param("id"))))
  .post("/:id/stop-repeating", async (c) =>
    c.json(hollerOut(await stopRepeating(requireMember(c), c.req.param("id")))),
  )
  .put("/:id/repeat", sValidator("json", repeatInputSchema), async (c) =>
    c.json(
      hollerOut(
        await changeRepeat(requireMember(c), c.req.param("id"), c.req.valid("json").repeat),
      ),
    ),
  )
  .post("/:id/remind", async (c) =>
    c.json(hollerOut(await remindWaiting(requireMember(c), c.env, c.req.param("id")))),
  )
  .get("/:id/people", async (c) => c.json(await hollerPeople(requireMember(c), c.req.param("id"))))
  .get("/:id/results", async (c) => {
    const ctx = requireMember(c);
    // getHoller throws not_found unless the member may see it.
    await getHoller(ctx, c.req.param("id"));
    return c.json(await resultsFor(ctx, c.req.param("id")));
  })
  .get(
    "/:id/export",
    sValidator("query", z.object({ format: exportFormatSchema.default("csv") })),
    async (c) => {
      const ctx = requireMember(c);
      const id = c.req.param("id");
      const { format } = c.req.valid("query");
      const body = format === "csv" ? await exportCsv(ctx, id) : await exportMarkdown(ctx, id);
      return c.body(body, 200, {
        "content-type":
          format === "csv" ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="holler-${id}.${format}"`,
      });
    },
  )
  .get("/:id/sharing", async (c) =>
    c.json(await getSharing(requireMember(c), c.env, c.req.param("id"))),
  )
  .put("/:id/visibility", sValidator("json", visibilityInputSchema), async (c) =>
    c.json(
      await setVisibility(
        requireMember(c),
        c.env,
        c.req.param("id"),
        c.req.valid("json").visibility,
      ),
    ),
  )
  .post("/:id/viewers", sValidator("json", viewersInputSchema), async (c) =>
    c.json(await addViewers(requireMember(c), c.env, c.req.param("id"), c.req.valid("json"))),
  )
  .delete("/:id/viewers/:slackUserId", async (c) =>
    c.json(
      await removeViewer(requireMember(c), c.env, c.req.param("id"), c.req.param("slackUserId")),
    ),
  )
  .post("/:id/report-link", async (c) =>
    c.json(await makeReportLink(requireMember(c), c.env, c.req.param("id"))),
  )
  .delete("/:id/report-link", async (c) =>
    c.json(await turnOffReportLink(requireMember(c), c.env, c.req.param("id"))),
  );
