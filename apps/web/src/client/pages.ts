import type { ProductPath } from "@holler/core";
import type { FileRouteTypes } from "./routeTree.gen";

type Page = FileRouteTypes["to"];

export const productPathsWithoutAPage: Record<Exclude<ProductPath, Page>, never> = {};

type NotBuiltYet<Path extends string> = Path extends Page
  ? { thisPageExistsNow: `use <Link to="${Path}">` }
  : unknown;

export function waitingFor<const Path extends string>(
  _pullRequest: `#${number}`,
  path: Path & NotBuiltYet<Path>,
): string {
  return path;
}
