import type { HomeCounts } from "@holler/core";
import type { SlackView } from "../client";
import {
  actionIds,
  context,
  escapeMrkdwn,
  plain,
  type SlackHoller,
  section,
  surfaceOf,
  timeOfDay,
  when,
} from "./format";

export const homeRowLimit = 10;

export interface HomeLive {
  id: string;
  title: string;
  answered: number;
  recipients: number;
  closesAt: Date | null;
  remind: { status: "ready" } | { status: "wait"; last: Date; next: Date } | { status: "nobody" };
}

export interface HomeWaiting {
  holler: SlackHoller;
  respondUrl: string | null;
}

export interface HomeState {
  sender: { counts: HomeCounts; live: HomeLive[]; moreLive: number } | null;
  waiting: HomeWaiting[];
  moreWaiting: number;
  timeZone: string | null;
  now: Date;
  productUrl: string;
}

const count = new Intl.NumberFormat("en-GB");
const n = (value: number) => count.format(value);

const header = (text: string) => ({ type: "header", text: plain(text, 150) });
const divider = { type: "divider" };

const link = (text: string, url: string, actionId: string = actionIds.productLink) => ({
  type: "button",
  action_id: actionId,
  text: plain(text),
  url,
});

function numbers({ live, waiting, scheduled }: HomeCounts) {
  const people =
    waiting === 1 ? "*1* person still to answer" : `*${n(waiting)}* people still to answer`;
  return section(`*${n(live)}* live now   ·   ${people}   ·   *${n(scheduled)}* scheduled`);
}

function liveRow(row: HomeLive, state: HomeState): unknown[] {
  const parts = [`${n(row.answered)} of ${n(row.recipients)} answered`];
  if (row.closesAt) parts.push(`Closes ${when(row.closesAt, state.timeZone, state.now)}`);
  const lines = [`*${escapeMrkdwn(row.title)}*`, parts.join(" · ")];
  if (row.remind.status === "wait") {
    const last = timeOfDay(row.remind.last, state.timeZone);
    const next = timeOfDay(row.remind.next, state.timeZone);
    lines.push(`Reminded at ${last}. You can remind again at ${next}.`);
  }
  const elements: unknown[] = [link("See results", `${state.productUrl}/hollers/${row.id}`)];
  if (row.remind.status === "ready") {
    elements.push({
      type: "button",
      action_id: actionIds.homeRemind,
      text: plain("Send reminder"),
      value: row.id,
    });
  }
  return [
    {
      type: "section",
      block_id: `live:${row.id}`,
      text: { type: "mrkdwn", text: lines.join("\n") },
    },
    { type: "actions", block_id: `live-actions:${row.id}`, elements },
  ];
}

function senderBlocks(sender: NonNullable<HomeState["sender"]>, state: HomeState): unknown[] {
  const blocks: unknown[] = [
    header("Your hollers"),
    numbers(sender.counts),
    {
      type: "actions",
      block_id: "home:start",
      elements: [
        {
          type: "button",
          action_id: actionIds.homeNew,
          text: plain("New holler"),
          style: "primary",
          value: "new",
        },
        link("Open Holler", state.productUrl),
      ],
    },
  ];
  if (sender.live.length === 0) {
    blocks.push(context("Nothing is live right now. A Holler you send shows up here."));
    return blocks;
  }
  for (const row of sender.live) blocks.push(...liveRow(row, state));
  if (sender.moreLive === 1) {
    blocks.push(context(`And 1 more live Holler. <${state.productUrl}|See it in Holler>`));
  } else if (sender.moreLive > 1) {
    blocks.push(
      context(
        `And ${n(sender.moreLive)} more live hollers. <${state.productUrl}|See them in Holler>`,
      ),
    );
  }
  return blocks;
}

function waitingRow({ holler, respondUrl }: HomeWaiting, state: HomeState): unknown[] {
  const parts = [`From ${escapeMrkdwn(holler.senderName)}`];
  if (holler.closesAt) parts.push(`Closes ${when(holler.closesAt, state.timeZone, state.now)}`);
  const text = { type: "mrkdwn", text: `*${escapeMrkdwn(holler.title)}*\n${parts.join(" · ")}` };
  const where = surfaceOf(holler).where;
  const controls =
    where === "chase"
      ? [
          { ...link("Open the form", holler.externalUrl ?? state.productUrl, actionIds.formLink) },
          {
            type: "button",
            action_id: actionIds.done,
            text: plain("I submitted it"),
            value: holler.id,
          },
        ]
      : where === "web" && respondUrl
        ? [link("Answer", respondUrl, actionIds.respondLink)]
        : [{ type: "button", action_id: actionIds.open, text: plain("Answer"), value: holler.id }];
  return [
    { type: "section", block_id: `wait:${holler.id}`, text },
    { type: "actions", block_id: `wait-actions:${holler.id}`, elements: controls },
  ];
}

function waitingBlocks(state: HomeState): unknown[] {
  const blocks: unknown[] = [header("Waiting on you")];
  if (state.waiting.length === 0) {
    blocks.push(context("Nothing is waiting on you."));
    return blocks;
  }
  for (const row of state.waiting) blocks.push(...waitingRow(row, state));
  if (state.moreWaiting === 1) {
    blocks.push(context("And 1 more. Answer the ones above and it shows up here."));
  } else if (state.moreWaiting > 1) {
    blocks.push(
      context(`And ${n(state.moreWaiting)} more. Answer the ones above and they show up here.`),
    );
  }
  return blocks;
}

function signInBlocks(state: HomeState): unknown[] {
  return [
    divider,
    section("*Ask your team something*\nSign in once with Slack to send your own."),
    {
      type: "actions",
      block_id: "home:sign-in",
      elements: [link("Sign in to Holler", `${state.productUrl}/sign-in`)],
    },
  ];
}

export function homeView(state: HomeState): SlackView {
  const waitingFirst = state.waiting.length > 0 || !state.sender;
  const blocks: unknown[] = [];
  if (waitingFirst) blocks.push(...waitingBlocks(state));
  if (state.sender) {
    if (waitingFirst) blocks.push(divider);
    blocks.push(...senderBlocks(state.sender, state));
    if (!waitingFirst) blocks.push(divider, ...waitingBlocks(state));
  } else {
    blocks.push(...signInBlocks(state));
  }
  return { type: "home", blocks };
}
