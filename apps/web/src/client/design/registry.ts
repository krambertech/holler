import type { ComponentType } from "react";
import { Accessibility } from "./accessibility";
import { Brand } from "./brand";
import { Colour } from "./colour";
import { IllustrationPage } from "./illustration";
import { Motion } from "./motion";
import { actions } from "./parts/actions";
import { answering } from "./parts/answering";
import { answers } from "./parts/answers";
import { apiAccess } from "./parts/api-access";
import { billing } from "./parts/billing";
import { choosing } from "./parts/choosing";
import { editor } from "./parts/editor";
import { feedback } from "./parts/feedback";
import { forms } from "./parts/forms";
import { labels } from "./parts/labels";
import { lists } from "./parts/lists";
import { menus } from "./parts/menus";
import { navigation } from "./parts/navigation";
import { overlays } from "./parts/overlays";
import { people } from "./parts/people";
import { questions } from "./parts/questions";
import { results } from "./parts/results";
import { sendDialog } from "./parts/send-dialog";
import { sending } from "./parts/sending";
import { settings } from "./parts/settings";
import { states } from "./parts/states";
import { surfaces } from "./parts/surfaces";
import type { Group } from "./parts/types";
import { Space } from "./space";
import { Typography } from "./typography";
import { Voice } from "./voice";

export interface Foundation {
  slug: string;
  title: string;
  /** The page's own file under `apps/web/src/client`, for its source link. */
  source: string;
  Page: ComponentType;
  /** Components this page documents, for the coverage check. */
  covers?: string[];
}

export const FOUNDATIONS: Foundation[] = [
  {
    slug: "brand",
    title: "Brand",
    source: "design/brand.tsx",
    Page: Brand,
    covers: ["Mark", "Logo"],
  },
  { slug: "colour", title: "Colour", source: "design/colour.tsx", Page: Colour },
  {
    slug: "illustration",
    title: "Illustration",
    source: "design/illustration.tsx",
    Page: IllustrationPage,
    covers: ["Illustration"],
  },
  { slug: "typography", title: "Typography", source: "design/typography.tsx", Page: Typography },
  { slug: "space", title: "Space, shape and depth", source: "design/space.tsx", Page: Space },
  {
    slug: "motion",
    title: "Motion",
    source: "design/motion.tsx",
    Page: Motion,
    covers: ["FluidHighlight"],
  },
  { slug: "voice", title: "Voice and words", source: "design/voice.tsx", Page: Voice },
  {
    slug: "accessibility",
    title: "Accessibility",
    source: "design/accessibility.tsx",
    Page: Accessibility,
  },
];

export const GROUPS: Group[] = [
  actions,
  forms,
  choosing,
  questions,
  editor,
  answering,
  menus,
  overlays,
  states,
  surfaces,
  lists,
  answers,
  results,
  labels,
  people,
  feedback,
  navigation,
  sending,
  sendDialog,
  settings,
  billing,
  apiAccess,
];

export interface DocItem {
  key: string;
  title: string;
  href: string;
}

/** Reading order, for previous and next. */
export const ORDER: DocItem[] = [
  ...FOUNDATIONS.map((f) => ({ key: `page:${f.slug}`, title: f.title, href: `/design/${f.slug}` })),
  ...GROUPS.map((g) => ({
    key: `group:${g.slug}`,
    title: g.title,
    href: `/design/components/${g.slug}`,
  })),
];
