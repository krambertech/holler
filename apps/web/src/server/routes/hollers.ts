import { hollerDraftSchema, listHollersQuerySchema } from "@holler/core";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { closeHoller, remindWaiting, sendHoller } from "../services/delivery";
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
import { previewSend } from "../services/send-preview";
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
  .post("/:id/remind", async (c) =>
    c.json(hollerOut(await remindWaiting(requireMember(c), c.env, c.req.param("id")))),
  )
  .get("/:id/people", async (c) => c.json(await hollerPeople(requireMember(c), c.req.param("id"))))
  .get("/:id/results", async (c) => {
    const ctx = requireMember(c);
    // getHoller throws not_found unless the member may see it.
    await getHoller(ctx, c.req.param("id"));
    return c.json(await resultsFor(ctx, c.req.param("id")));
  });
