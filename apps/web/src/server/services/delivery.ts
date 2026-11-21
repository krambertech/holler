import type { Bindings } from "../env";
import { type ServiceContext, ServiceError } from "./context";
import { getHoller } from "./hollers";

/**
 * PLACEHOLDER. The Slack delivery area owns this file and replaces it wholesale; keep these
 * three names and signatures (docs/work-areas.md, Contracts between areas). Until then every
 * door that sends, closes or reminds gets the same plain refusal, and tests stub this module.
 */

type HollerDetail = Awaited<ReturnType<typeof getHoller>>;

const notYet = () =>
  new ServiceError(
    "slack_unavailable",
    "Holler cannot reach Slack from here yet. Your Holler is saved; try again once Slack delivery is switched on.",
  );

export async function sendHoller(
  ctx: ServiceContext,
  _env: Bindings,
  id: string,
): Promise<HollerDetail> {
  await getHoller(ctx, id);
  throw notYet();
}

export async function closeHoller(
  ctx: ServiceContext,
  _env: Bindings,
  id: string,
): Promise<HollerDetail> {
  await getHoller(ctx, id);
  throw notYet();
}

export async function remindWaiting(
  ctx: ServiceContext,
  _env: Bindings,
  id: string,
): Promise<HollerDetail> {
  await getHoller(ctx, id);
  throw notYet();
}
