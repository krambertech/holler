import { Hono } from "hono";
import type { AppEnv } from "../../app";
import { v1Account } from "./account";
import { v1Hollers } from "./hollers";
import { authenticate } from "./http";

export const v1Routes = new Hono<AppEnv>()
  .use("*", authenticate)
  .route("/hollers", v1Hollers)
  .route("/", v1Account);
