import type { HollerDraftInput } from "@holler/core";
import { runCronPass } from "../cron";
import { createDb, type Db } from "../db";
import type { Bindings } from "../env";
import { recipientContext } from "../services/answering";
import type { ServiceContext } from "../services/context";
import { deliver, postKey, type SlackSend, sendEffects, sendHoller } from "../services/delivery";
import { workspaceFixture } from "../services/fixtures";
import { createDraft } from "../services/hollers";
import { devSlack } from "../services/slack-connection";
import { type PostMessage, SlackApiError } from "../slack/client";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import { Life } from "./life";
import { d1Within, type LocalD1, type Stored } from "./local-d1";

export const BASE = new Date("2026-11-20T10:00:00Z");
export const CHANNEL = "CNEWS";
const MINUTE = 60_000;
export const minutes = (count: number) => new Date(BASE.getTime() + count * MINUTE);
export const hours = (count: number) => minutes(count * 60);

export interface Post {
  send: SlackSend;
  key: string;
  at: Date;
  ts: string;
  content: string;
}

export interface Edit {
  send: SlackSend;
  at: Date;
  ts: string;
  content: string;
}

export interface Side {
  env: Bindings;
  db: Db;
  sender: (at: Date) => ServiceContext;
  recipient: (slackUserId: string, at: Date) => ServiceContext;
}

export interface Wishes {
  answerBy?: { hollerId: string; slackUserId: string };
  reminderNowAt?: Date;
  stopped?: boolean;
  noted?: boolean;
  snoozedTs?: string;
}

export const contentOf = ({ text, blocks }: Pick<PostMessage, "text" | "blocks">) =>
  JSON.stringify({ text, blocks });

type Posting = Parameters<typeof postKey>[0];

function isPosting(send: SlackSend): send is Posting {
  return sendEffects[send.kind] === "posts";
}

interface Snapshot {
  stored: Stored;
  queued: SlackSend[];
  posts: Post[];
  edits: Edit[];
}

export class World {
  posts: Post[] = [];
  edits: Edit[] = [];
  readonly wishes: Wishes = {};
  deliversOnPaper = false;
  remindsPeople = false;
  private life = new Life();
  private delivering: { send: SlackSend; at: Date } | null = null;

  private constructor(
    private readonly d1: LocalD1,
    private readonly env: Bindings,
    readonly queued: SlackSend[],
    private readonly base: ServiceContext,
    readonly healthy: Db,
  ) {}

  static async create(d1: LocalD1): Promise<World> {
    const raw = d1Within(new Life(), d1.call);
    const db = createDb(raw);
    await emptyDatabase(raw);
    const { ctx } = await workspaceFixture(db, BASE);
    const { env, queued } = deliveryEnv(db, raw);
    const world = new World(d1, env, queued, ctx, db);
    await world.watchSlack();
    return world;
  }

  get workspaceId() {
    return this.base.workspaceId;
  }

  async snapshot(): Promise<Snapshot> {
    return {
      stored: await this.d1.dump(),
      queued: [...this.queued],
      posts: [...this.posts],
      edits: [...this.edits],
    };
  }

  async restore(snapshot: Snapshot): Promise<void> {
    await this.d1.restore(snapshot.stored);
    this.queued.splice(0, this.queued.length, ...snapshot.queued);
    this.posts = [...snapshot.posts];
    this.edits = [...snapshot.edits];
  }

  private async watchSlack() {
    const slack = await devSlack(this.healthy, this.workspaceId);
    const post = slack.postMessage.bind(slack);
    const edit = slack.updateMessage.bind(slack);
    const refusal = (method: string) => () => new SlackApiError(method, "internal_error");
    slack.postMessage = (input) => {
      const { send, at } = this.underway();
      return this.life.step(
        { label: `Slack posts ${send.kind}`, writes: true },
        async () => {
          const { channel } = await post(input);
          if (!isPosting(send)) throw new Error(`${send.kind} edits, but it posted`);
          const ts = `${1_700_000_000 + this.posts.length}.000100`;
          this.posts.push({ send, key: postKey(send), at, ts, content: contentOf(input) });
          return { channel, ts };
        },
        refusal("chat.postMessage"),
      );
    };
    slack.updateMessage = (input) => {
      const { send, at } = this.underway();
      return this.life.step(
        { label: `Slack edits ${send.kind}`, writes: true },
        async () => {
          await edit(input);
          this.edits.push({ send, at, ts: input.ts, content: contentOf(input) });
        },
        refusal("chat.update"),
      );
    };
  }

  private underway() {
    if (!this.delivering) throw new Error("Slack is called only while a send is delivered");
    return this.delivering;
  }

  side(life = new Life()): Side {
    const raw = d1Within(life, this.d1.call);
    const db = createDb(raw);
    const queue = this.env.SLACK_SENDS;
    const sendBatch = (messages: Iterable<{ body: SlackSend }>) => {
      const batch = [...messages];
      const kinds = [...new Set(batch.map((message) => message.body.kind))].join(" + ");
      return life.step(
        { label: `queue ${kinds}`, writes: true },
        () => queue.sendBatch(batch),
        () => new Error("Queue is down"),
      );
    };
    const env = { ...this.env, DB: raw, SLACK_SENDS: { sendBatch } } as unknown as Bindings;
    const base = { ...this.base, db };
    return {
      env,
      db,
      sender: (at) => ({ ...base, now: () => at }),
      recipient: (slackUserId, at) => recipientContext({ ...base, now: () => at }, slackUserId),
    };
  }

  async within<T>(life: Life, act: () => Promise<T>): Promise<T> {
    const before = this.life;
    this.life = life;
    try {
      return await act();
    } finally {
      this.life = before;
      this.delivering = null;
    }
  }

  async deliver(side: Side, send: SlackSend, at: Date): Promise<void> {
    this.delivering = { send, at };
    await deliver(side.env, side.db, send, at);
  }

  async drain(at: Date): Promise<void> {
    const side = this.side();
    for (let send = this.queued.shift(); send; send = this.queued.shift()) {
      if (!this.deliversOnPaper) await this.deliver(side, send, at);
      else if (isPosting(send)) this.deliverOnPaper(send, at);
    }
  }

  private deliverOnPaper(send: Posting, at: Date) {
    const key = postKey(send);
    if (this.posts.some((post) => post.key === key)) return;
    this.posts.push({ send, key, at, ts: `paper ${this.posts.length}`, content: "" });
  }

  async cron(at: Date): Promise<void> {
    const { env, db } = this.side();
    await runCronPass(env, db, at);
    await this.drain(at);
  }

  takeQueued(match: (send: SlackSend) => boolean): SlackSend {
    const index = this.queued.findIndex(match);
    const [send] = index < 0 ? [] : this.queued.splice(index, 1);
    if (!send) throw new Error("the send this scenario takes was not queued");
    return send;
  }

  dmOf(hollerId: string, slackUserId: string): { channel: string; ts: string } {
    const post = this.posts.findLast(({ send }) => isTo(send, hollerId, slackUserId));
    if (!post) throw new Error(`${slackUserId} has no DM`);
    return { channel: `D${slackUserId.slice(1)}`, ts: post.ts };
  }

  async draft(draft: Partial<HollerDraftInput> = {}) {
    return createDraft(this.side().sender(BASE), {
      mode: "pulse",
      title: "How was your week?",
      questions: [
        {
          type: "single",
          prompt: "How was your week?",
          options: [{ label: "Good" }, { label: "Rough" }],
          followUp: { prompt: "What happened?", onlyAfter: null },
        },
      ],
      audience: { people: ["UA", "UB"], groups: [], everyone: false },
      closeAfterHours: 4,
      ...draft,
    });
  }

  async sent(draft: Partial<HollerDraftInput> = {}) {
    const holler = await this.draft(draft);
    const side = this.side();
    await sendHoller(side.sender(BASE), side.env, holler.id);
    return holler;
  }

  async live(draft: Partial<HollerDraftInput> = {}) {
    const holler = await this.sent(draft);
    await this.drain(BASE);
    return holler;
  }
}

export function isTo(send: SlackSend, hollerId: string, slackUserId: string): boolean {
  return "slackUserId" in send && send.hollerId === hollerId && send.slackUserId === slackUserId;
}

const ID = /\b[a-z]{3}_[0-9a-z]{16}\b/g;

export function fingerprint(snapshot: Snapshot, before: Snapshot): string {
  const known = new Set(JSON.stringify(before).match(ID));
  const named = (value: unknown) =>
    JSON.stringify(value).replace(ID, (id) => (known.has(id) ? id : id.slice(0, 3)));
  const rows = Object.entries(snapshot.stored).map(([table, list]) => [
    table,
    list.map(named).sort(),
  ]);
  return [rows, snapshot.queued, snapshot.posts, snapshot.edits].map(named).join("\n");
}
