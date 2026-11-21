import { type ServiceContext, ServiceError } from "./context";
import { getHoller } from "./hollers";

/**
 * PLACEHOLDER. The results area owns this file and replaces it wholesale; keep these names
 * and signatures (docs/work-areas.md, Contracts between areas). Tests stub this module.
 */

const notYet = () =>
  new ServiceError("slack_unavailable", "Exports are not switched on yet. Try again later.");

export async function exportCsv(ctx: ServiceContext, id: string): Promise<string> {
  await getHoller(ctx, id);
  throw notYet();
}

export async function exportMarkdown(ctx: ServiceContext, id: string): Promise<string> {
  await getHoller(ctx, id);
  throw notYet();
}
