import { Hono } from "hono";
import type { AppEnv } from "../../app";
import { v1Account } from "./account";
import { v1Hollers } from "./hollers";
import { authenticate } from "./http";

/**
 * The public REST API. The same services as the web app, so a rule kept in one door is kept
 * in all of them. docs/api.md; the reference is generated at /api/openapi.json.
 */
export const v1Routes = new Hono<AppEnv>()
  .use("*", authenticate)
  .route("/hollers", v1Hollers)
  .route("/", v1Account);
