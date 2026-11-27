import { quietBeforeCloseHours, reminderTiers, repeatDays } from "@holler/core";
import { eq } from "@holler/core/db";
import { schema } from "../db";
import { loadSlackHoller } from "../services/delivery";
import { announcementMessage } from "../slack/blocks/messages";
import { contentOf, isTo, type World } from "./world";

export const promises = {
  audience: "a live Holler has its whole audience as recipients",
  invited: "every recipient of a live Holler gets it",
  once: "nobody gets the same message twice",
  answer: "a person marked answered has a stored response, and an answer given is kept",
  reminded: "everyone still waiting gets every reminder they are due",
  rhythm: "one lost reminder does not stop the ones after it",
  reminderNow: "the creator's Send reminder reaches everyone waiting",
  notice: "a closed Holler's creator gets the notice",
  told: "a creator hears that their scheduled Holler could not go out",
  rounds: "a repeating series has exactly one next round, on its rule, and none once stopped",
  announced: "the channel gets the announcement",
  counted: "the announcement shows what is stored",
  thanked: "the DM of a person who answered says so",
  closedDm: "the DM of a person who did not answer says the Holler closed",
  snoozed: "the reminder a person snoozed says when the next one comes",
  activity: "Activity matches what is stored",
} as const;

export type PromiseId = keyof typeof promises;

const HOUR = 3_600_000;
const SETTLED = HOUR / 2;

async function stored(world: World) {
  const db = world.healthy;
  const [hollers, recipients, responses, activity, notes] = await db.batch([
    db.select().from(schema.hollers).where(eq(schema.hollers.workspaceId, world.workspaceId)),
    db.select().from(schema.recipients),
    db.select().from(schema.responses),
    db.select().from(schema.activity),
    db.select().from(schema.answerNotes),
  ]);
  return { hollers, recipients, responses, activity, notes };
}

type Stored = Awaited<ReturnType<typeof stored>>;
type Holler = Stored["hollers"][number];

export async function brokenPromises(
  world: World,
  at: Date,
  when: "soon" | "end",
): Promise<PromiseId[]> {
  const state = await stored(world);
  const broken = new Set<PromiseId>();
  const keep = (id: PromiseId, kept: boolean) => {
    if (!kept) broken.add(id);
  };
  const sent = state.hollers.filter((holler) => holler.sentAt !== null);

  const keys = world.posts.map((post) => post.key);
  keep("once", new Set(keys).size === keys.length && !remindedTwice(world));

  for (const holler of sent) {
    const people = state.recipients.filter((row) => row.hollerId === holler.id);
    keep(
      "audience",
      holler.audience.people.every((id) => people.some((row) => row.slackUserId === id)),
    );
    for (const person of people) {
      const dms = world.posts.filter(({ send }) => isTo(send, holler.id, person.slackUserId));
      const editedTo = (kind: "answered" | "closed") =>
        world.edits.some(({ send, ts }) => send.kind === kind && dms.some((dm) => dm.ts === ts));
      if (when === "end") keep("invited", dms.length > 0);
      const answered = person.answeredAt !== null;
      const response = hasResponse(state, holler, person.slackUserId);
      keep("answer", answered === response);
      if (answered && response && dms.length > 0) keep("thanked", editedTo("answered"));
      if (world.remindsPeople && !answered && dms[0]) {
        const reminders = dms.filter(({ send }) => send.kind === "reminder");
        const missing = remindersDue(holler, dms[0].at, at) - reminders.length;
        keep("reminded", missing <= 0);
        keep("rhythm", missing <= 1);
      }
      const latest = dms.at(-1);
      if (holler.status === "closed" && !answered && latest && !world.deliversOnPaper) {
        keep(
          "closedDm",
          world.edits.some(({ send, ts }) => send.kind === "closed" && ts === latest.ts),
        );
      }
      if (world.wishes.reminderNowAt) {
        const since = world.wishes.reminderNowAt.getTime();
        keep(
          "reminderNow",
          dms.some(
            (dm) =>
              dm.send.kind === "reminder" &&
              dm.at.getTime() >= since &&
              dm.at.getTime() <= since + HOUR,
          ),
        );
      }
    }
    if (holler.status === "closed") {
      keep(
        "notice",
        world.posts.some(({ send }) => send.kind === "close_notice" && send.hollerId === holler.id),
      );
    }
    if (holler.announceChannelId && !world.deliversOnPaper) {
      const shown = announcements(world, holler.id);
      keep("announced", shown.length > 0);
      if (shown.length > 0 && !broken.has("answer")) {
        keep("counted", shown.at(-1)?.content === (await announcementNow(world, state, holler)));
      }
    }
  }

  const { answerBy, snoozedTs, stopped, noted, repeatsEvery } = world.wishes;
  if (answerBy) {
    keep(
      "answer",
      sent.some(
        (holler) =>
          holler.id === answerBy.hollerId && hasResponse(state, holler, answerBy.slackUserId),
      ),
    );
  }
  if (snoozedTs) {
    keep(
      "snoozed",
      world.edits.some(({ send, ts }) => send.kind === "snoozed" && ts === snoozedTs),
    );
  }
  for (const root of state.hollers.filter((holler) => holler.repeatOfId === null)) {
    const series = state.hollers.filter(
      (holler) => holler.id === root.id || holler.repeatOfId === root.id,
    );
    if (root.repeatRule === null && series.length === 1 && !stopped) continue;
    const next = series.filter((holler) => holler.status === "scheduled");
    keep("rounds", next.length === (root.repeatRule ? 1 : 0) && !(stopped && root.repeatRule));
    keep(
      "rounds",
      next.every((round) => onRule(root, round)),
    );
    if (repeatsEvery) keep("rounds", root.repeatRule === repeatsEvery);
  }

  const happened = (action: string, subjectId?: string) =>
    state.activity.filter(
      (row) => row.action === action && (!subjectId || row.subjectId === subjectId),
    ).length;
  for (const holler of state.hollers) {
    const failed = happened("holler.send_failed", holler.id) > 0;
    keep("activity", happened("holler.sent", holler.id) === (holler.sentAt ? 1 : 0));
    keep("activity", happened("holler.closed", holler.id) === (holler.status === "closed" ? 1 : 0));
    if (holler.status === "scheduled") {
      keep("activity", happened("holler.scheduled", holler.id) === 1);
    }
    if (holler.remindedAt) keep("activity", happened("holler.reminded", holler.id) > 0);
    if (failed) {
      keep(
        "told",
        world.posts.some(({ send }) => send.kind === "send_failed" && send.hollerId === holler.id),
      );
    }
  }
  if (state.recipients.some((row) => row.snoozedUntil)) {
    keep("activity", happened("reminder.snoozed") > 0);
  }
  if (stopped) keep("activity", happened("holler.repeat_stopped") > 0);
  if (repeatsEvery) keep("activity", happened("holler.repeat_changed") === 1);
  if (noted && state.notes.length > 0) keep("activity", happened("response.noted") > 0);

  return [...broken];
}

function onRule(root: Holler, round: Holler): boolean {
  if (!root.repeatRule || !root.sendAt || !round.sendAt) return false;
  const apart = round.sendAt.getTime() - root.sendAt.getTime();
  const step = repeatDays[root.repeatRule] * 24 * HOUR;
  return round.repeatRule === root.repeatRule && apart > 0 && apart % step === 0;
}

function hasResponse(state: Stored, holler: Holler, slackUserId: string): boolean {
  const responses = state.responses.filter((row) => row.hollerId === holler.id);
  if (!holler.anonymous) return responses.some((row) => row.slackUserId === slackUserId);
  const answered = state.recipients.filter(
    (row) => row.hollerId === holler.id && row.answeredAt !== null,
  );
  return (
    responses.length === answered.length && answered.some((row) => row.slackUserId === slackUserId)
  );
}

function remindedTwice(world: World): boolean {
  const reminders = world.posts.flatMap(({ send }) =>
    send.kind === "reminder" ? [`${send.hollerId} ${send.slackUserId} ${send.tone}`] : [],
  );
  return new Set(reminders).size !== reminders.length;
}

function remindersDue(holler: Holler, invitedAt: Date, at: Date): number {
  const closesAt = holler.closesAt?.getTime() ?? 0;
  return reminderTiers.filter((tier) => {
    const due = invitedAt.getTime() + tier.afterHours * HOUR;
    return due + SETTLED <= at.getTime() && due <= closesAt - quietBeforeCloseHours * HOUR;
  }).length;
}

function announcements(world: World, hollerId: string) {
  return [...world.posts, ...world.edits]
    .filter(({ send }) => send.kind === "announce" && send.hollerId === hollerId)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

async function announcementNow(world: World, state: Stored, holler: Holler): Promise<string> {
  const loaded = await loadSlackHoller(world.healthy, holler.id);
  if (!loaded) throw new Error(`Holler ${holler.id} is gone`);
  const people = state.recipients.filter((row) => row.hollerId === holler.id);
  const counts = {
    recipients: people.length,
    answered: people.filter((row) => row.answeredAt).length,
  };
  return contentOf(announcementMessage(loaded.holler, counts, holler.status === "closed"));
}
