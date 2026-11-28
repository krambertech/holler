import { and, eq } from "@holler/core/db";
import { schema } from "../db";
import {
  addNoteFromSlack,
  answerFromSlack,
  queueOutcome,
  snoozeFromSlack,
} from "../services/answering";
import {
  closeHoller,
  queueCloseWork,
  queueDueInvites,
  remindWaiting,
  type SlackSend,
  sendDueHollers,
  sendHoller,
} from "../services/delivery";
import { markHomeOpened, queueHomes } from "../services/home-queue";
import { closeDueHollers } from "../services/lifecycle";
import { queueDueReminders } from "../services/reminders";
import { answerOnWeb } from "../services/respond";
import { stopRepeating } from "../services/rounds";
import { addViewers } from "../services/sharing";
import { BASE, CHANNEL, hours, minutes, type Side, type World } from "./world";

export interface Scenario {
  operation: string;
  arrange: (world: World) => Promise<Operation>;
}

export interface Operation {
  at: Date;
  act: (side: Side, at: Date) => Promise<unknown>;
  redone?: "by the person" | "by the queue";
}

const audienceOf = (...people: string[]) => ({ people, groups: [], everyone: false });
const WEEK = { closeAfterHours: 168, audience: audienceOf("UA") };
const MANY = Array.from({ length: 130 }, (_, index) => `UMANY${index}`);

async function manyPeople(world: World) {
  const db = world.healthy;
  const [first, ...rest] = MANY.map((slackUserId) =>
    db.insert(schema.slackPeople).values({
      workspaceId: world.workspaceId,
      slackUserId,
      name: slackUserId,
      searchName: slackUserId.toLocaleLowerCase(),
    }),
  );
  if (first !== undefined) await db.batch([first, ...rest]);
}

async function answerOf(world: World, hollerId: string, slackUserId: string, at: Date) {
  const side = world.side();
  const holler = await firstQuestion(world, hollerId);
  const outcome = await answerFromSlack(
    side.recipient(slackUserId, at),
    hollerId,
    "slack_button",
    holler.response,
  );
  if (outcome.status !== "answered") throw new Error(`the scenario's answer was ${outcome.status}`);
  return { ...holler, responseId: outcome.responseId };
}

async function firstQuestion(world: World, hollerId: string) {
  const question = await world.healthy.query.questions.findFirst({
    where: eq(schema.questions.hollerId, hollerId),
  });
  if (!question) throw new Error("the scenario's Holler has a question");
  const option = await world.healthy.query.options.findFirst({
    where: eq(schema.options.questionId, question.id),
  });
  if (!option) throw new Error("the scenario's question has an option");
  return {
    questionId: question.id,
    response: { answers: [{ questionId: question.id, optionIds: [option.id] }] },
  };
}

interface Delivery extends Scenario {
  kind: SlackSend["kind"];
}

function delivery(
  kind: SlackSend["kind"],
  arrange: (world: World) => Promise<{ at: Date }>,
): Delivery {
  return {
    kind,
    operation: `deliver ${kind}`,
    arrange: async (world) => {
      const { at } = await arrange(world);
      const send = world.takeQueued((queued) => queued.kind === kind);
      return { at, redone: "by the queue", act: (side, now) => world.deliver(side, send, now) };
    },
  };
}

export const deliveries: Delivery[] = [
  delivery("invite", async (world) => {
    world.remindsPeople = true;
    await world.sent(WEEK);
    return { at: BASE };
  }),
  delivery("reminder", async (world) => {
    world.remindsPeople = true;
    await world.live(WEEK);
    const { env, db } = world.side();
    await queueDueReminders(env, db, minutes(24 * 60 + 10));
    return { at: minutes(24 * 60 + 10) };
  }),
  delivery("announce", async (world) => {
    await world.sent({ announceChannelId: CHANNEL });
    return { at: BASE };
  }),
  delivery("close_notice", async (world) => {
    const { id } = await world.live();
    const side = world.side();
    await closeHoller(side.sender(minutes(10)), side.env, id);
    return { at: minutes(10) };
  }),
  delivery("shared", async (world) => {
    const { id } = await world.live();
    const side = world.side();
    await addViewers(side.sender(minutes(10)), side.env, id, { slackUserIds: ["UB"] });
    return { at: minutes(10) };
  }),
  delivery("send_failed", async (world) => {
    await unsendable(world);
    const { env, db } = world.side();
    await sendDueHollers(env, db, minutes(10));
    return { at: minutes(10) };
  }),
  delivery("answered", async (world) => {
    const { id } = await world.live({ announceChannelId: CHANNEL });
    const side = world.side();
    await answerOf(world, id, "UA", minutes(10));
    await queueOutcome(
      side.env,
      side.recipient("UA", minutes(10)),
      id,
      { status: "already" },
      world.dmOf(id, "UA"),
    );
    world.queued.push({ kind: "announce", hollerId: id });
    return { at: minutes(10) };
  }),
  delivery("closed", async (world) => {
    const { id } = await world.live();
    const side = world.side();
    await closeHoller(side.sender(minutes(10)), side.env, id);
    return { at: minutes(10) };
  }),
  delivery("home", async (world) => {
    await world.live(WEEK);
    const { env, db } = world.side();
    await markHomeOpened(db, world.workspaceId, "UA", minutes(10));
    await queueHomes(env, db, world.workspaceId, ["UA"], minutes(10));
    return { at: minutes(10) };
  }),
  delivery("snoozed", async (world) => {
    const { id, tapped } = await reminded(world);
    const side = world.side();
    await snoozeFromSlack(side.env, side.recipient("UA", hours(25)), id, tapped);
    return { at: hours(25) };
  }),
];

async function unsendable(world: World) {
  const holler = await world.draft({ sendAt: minutes(10), audience: audienceOf("UC") });
  const side = world.side();
  await sendHoller(side.sender(BASE), side.env, holler.id);
  await world.healthy
    .update(schema.slackPeople)
    .set({ isDeleted: true })
    .where(
      and(
        eq(schema.slackPeople.workspaceId, world.workspaceId),
        eq(schema.slackPeople.slackUserId, "UC"),
      ),
    );
}

async function reminded(world: World) {
  world.remindsPeople = true;
  const { id } = await world.live(WEEK);
  await world.cron(minutes(24 * 60 + 10));
  const tapped = world.dmOf(id, "UA");
  world.wishes.snoozedTs = tapped.ts;
  return { id, tapped };
}

async function series(world: World) {
  const holler = await world.draft({ sendAt: minutes(10), repeat: "week" });
  const side = world.side();
  await sendHoller(side.sender(BASE), side.env, holler.id);
  return holler;
}

export const operations: Scenario[] = [
  {
    operation: "sendHoller",
    arrange: async (world) => {
      const { id } = await world.draft({ announceChannelId: CHANNEL });
      return {
        at: BASE,
        redone: "by the person",
        act: (side, at) => sendHoller(side.sender(at), side.env, id),
      };
    },
  },
  {
    operation: "sendHoller to more people than one batch holds",
    arrange: async (world) => {
      world.deliversOnPaper = true;
      await manyPeople(world);
      const { id } = await world.draft({ audience: audienceOf(...MANY) });
      return {
        at: BASE,
        redone: "by the person",
        act: (side, at) => sendHoller(side.sender(at), side.env, id),
      };
    },
  },
  {
    operation: "sendHoller for later",
    arrange: async (world) => {
      const { id } = await world.draft({ sendAt: minutes(2) });
      return {
        at: BASE,
        redone: "by the person",
        act: (side, at) => sendHoller(side.sender(at), side.env, id),
      };
    },
  },
  {
    operation: "sendDueHollers",
    arrange: async (world) => {
      await series(world);
      return { at: minutes(10), act: ({ env, db }, at) => sendDueHollers(env, db, at) };
    },
  },
  {
    operation: "sendDueHollers with nobody to send to",
    arrange: async (world) => {
      await unsendable(world);
      return { at: minutes(10), act: ({ env, db }, at) => sendDueHollers(env, db, at) };
    },
  },
  {
    operation: "queueDueInvites",
    arrange: async (world) => {
      const { id } = await world.sent();
      world.queued.length = 0;
      await world.healthy
        .update(schema.recipients)
        .set({ invitedAt: null, sendAt: minutes(10) })
        .where(eq(schema.recipients.hollerId, id));
      return { at: minutes(10), act: ({ env, db }, at) => queueDueInvites(env, db, at) };
    },
  },
  {
    operation: "queueDueReminders",
    arrange: async (world) => {
      world.remindsPeople = true;
      await world.live(WEEK);
      return {
        at: minutes(24 * 60 + 10),
        act: ({ env, db }, at) => queueDueReminders(env, db, at),
      };
    },
  },
  {
    operation: "remindWaiting",
    arrange: async (world) => {
      world.remindsPeople = true;
      const { id } = await world.live(WEEK);
      world.wishes.reminderNowAt = hours(2);
      return {
        at: hours(2),
        redone: "by the person",
        act: (side, at) => remindWaiting(side.sender(at), side.env, id),
      };
    },
  },
  {
    operation: "closeHoller",
    arrange: async (world) => {
      const { id } = await world.live({ announceChannelId: CHANNEL });
      return {
        at: minutes(10),
        redone: "by the person",
        act: (side, at) => closeHoller(side.sender(at), side.env, id),
      };
    },
  },
  {
    operation: "closeDueHollers, then queueCloseWork",
    arrange: async (world) => {
      await world.live({ title: "Lunch?" });
      await world.live({ title: "Offsite?" });
      return {
        at: minutes(245),
        act: async ({ env, db }, at) => {
          await closeDueHollers(db, at);
          await queueCloseWork(db, env, at);
        },
      };
    },
  },
  {
    operation: "answerOnWeb",
    arrange: async (world) => {
      const { id } = await world.live({ announceChannelId: CHANNEL });
      const { response } = await firstQuestion(world, id);
      world.wishes.answerBy = { hollerId: id, slackUserId: "UA" };
      return {
        at: minutes(10),
        redone: "by the person",
        act: (side, at) => answerOnWeb(side.recipient("UA", at), side.env, id, response),
      };
    },
  },
  {
    operation: "answerFromSlack, then queueOutcome",
    arrange: async (world) => {
      const { id } = await world.live({ announceChannelId: CHANNEL, anonymous: true });
      const { response } = await firstQuestion(world, id);
      world.wishes.answerBy = { hollerId: id, slackUserId: "UA" };
      const tapped = world.dmOf(id, "UA");
      return {
        at: minutes(10),
        redone: "by the person",
        act: async (side, at) => {
          const ctx = side.recipient("UA", at);
          const outcome = await answerFromSlack(ctx, id, "slack_button", response);
          if (outcome.status === "invalid") throw new Error(outcome.message);
          await queueOutcome(side.env, ctx, id, outcome, tapped);
        },
      };
    },
  },
  {
    operation: "addNoteFromSlack",
    arrange: async (world) => {
      const { id } = await world.live();
      const { responseId, questionId } = await answerOf(world, id, "UA", minutes(5));
      world.wishes.noted = true;
      const input = { responseId, questionId, note: "It rained." };
      const tapped = world.dmOf(id, "UA");
      return {
        at: minutes(10),
        redone: "by the person",
        act: (side, at) => addNoteFromSlack(side.env, side.recipient("UA", at), input, tapped),
      };
    },
  },
  {
    operation: "snoozeFromSlack",
    arrange: async (world) => {
      const { id, tapped } = await reminded(world);
      return {
        at: hours(25),
        redone: "by the person",
        act: (side, at) => snoozeFromSlack(side.env, side.recipient("UA", at), id, tapped),
      };
    },
  },
  {
    operation: "stopRepeating",
    arrange: async (world) => {
      const { id } = await series(world);
      await world.cron(minutes(10));
      world.wishes.stopped = true;
      return {
        at: minutes(20),
        redone: "by the person",
        act: (side, at) => stopRepeating(side.sender(at), id),
      };
    },
  },
];
