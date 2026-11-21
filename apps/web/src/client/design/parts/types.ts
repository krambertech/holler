import type { ComponentType, ReactNode } from "react";

/** One component on a group's page. `name` must be the component's exported name: the coverage check reads it. */
export interface Entry {
  slug: string;
  name: string;
  note?: ReactNode;
  /** Path under `apps/web/src/client`. */
  source: string;
  /** Internal parts this entry documents too, for the coverage check, such as a shared chevron. */
  covers?: string[];
  Demo: ComponentType;
}

export interface Group {
  slug: string;
  title: string;
  lede: string;
  entries: Entry[];
}
