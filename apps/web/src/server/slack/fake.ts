import { blockKitProblems, viewProblems } from "./blocks/limits";
import type {
  PostMessage,
  SlackChannel,
  SlackClient,
  SlackTeam,
  SlackUser,
  SlackUserGroup,
  SlackView,
} from "./client";

/** Throws as Slack would when a payload breaks a Block Kit limit, naming every problem. */
function refuseInvalid(method: string, problems: string[]) {
  if (problems.length > 0) throw new Error(`Slack would refuse ${method}: ${problems.join("; ")}`);
}

/**
 * An in-memory Slack for tests and local development. It records every call, so a test asserts
 * on what Holler would have sent, and it answers directory calls from the people it was given.
 */
export class FakeSlack implements SlackClient {
  readonly posted: (PostMessage & { ts: string })[] = [];
  readonly updated: (PostMessage & { ts: string })[] = [];
  readonly views: { triggerId: string; view: SlackView; viewId: string }[] = [];
  readonly viewUpdates: { viewId: string; view: SlackView }[] = [];
  readonly homes: { userId: string; view: SlackView }[] = [];
  revoked = false;
  /** A test sets an error for a user, channel or group id, and any call about it throws it. */
  readonly failures = new Map<string, Error>();
  /** Slack paginates users.list; a test sets this to see Holler follow the cursor. */
  pageSize = Number.POSITIVE_INFINITY;
  private counter = 0;

  constructor(
    readonly people: SlackUser[] = [],
    readonly groups: (SlackUserGroup & { members: string[] })[] = [],
    readonly channels: SlackChannel[] = [],
    readonly team: SlackTeam = { id: "T0FAKE", name: "Fake workspace", domain: "fake" },
  ) {}

  async postMessage(input: PostMessage) {
    refuseInvalid("chat.postMessage", blockKitProblems("message", input.blocks ?? [], input.text));
    const failure = this.failures.get(input.channel);
    if (failure) throw failure;
    const ts = `${1_700_000_000 + this.counter++}.000100`;
    this.posted.push({ ...input, ts });
    return {
      channel: input.channel.startsWith("U") ? `D${input.channel.slice(1)}` : input.channel,
      ts,
    };
  }

  async updateMessage(input: PostMessage & { ts: string }) {
    refuseInvalid("chat.update", blockKitProblems("message", input.blocks ?? [], input.text));
    this.updated.push(input);
  }

  async openView(input: { triggerId: string; view: SlackView }) {
    refuseInvalid("views.open", viewProblems(input.view));
    const viewId = `V${String(this.counter++).padStart(6, "0")}`;
    this.views.push({ ...input, viewId });
    return { viewId };
  }

  async updateView(input: { viewId: string; view: SlackView }) {
    refuseInvalid("views.update", viewProblems(input.view));
    this.viewUpdates.push(input);
  }

  async publishHome(input: { userId: string; view: SlackView }) {
    refuseInvalid("views.publish", viewProblems(input.view));
    this.homes.push(input);
  }

  async listUsers(cursor?: string) {
    const start = Number(cursor ?? 0);
    const end = start + this.pageSize;
    return {
      members: this.people.slice(start, end),
      nextCursor: end < this.people.length ? String(end) : "",
    };
  }

  async listUserGroups() {
    return this.groups;
  }

  async userGroupMembers(groupId: string) {
    const failure = this.failures.get(groupId);
    if (failure) throw failure;
    return this.groups.find((g) => g.id === groupId)?.members ?? [];
  }

  /** Everyone is in every channel, paged like users.list. */
  async channelMembers(channelId: string, cursor?: string) {
    const failure = this.failures.get(channelId);
    if (failure) throw failure;
    const start = Number(cursor ?? 0);
    const end = start + this.pageSize;
    return {
      members: this.people.slice(start, end).map((p) => p.id),
      nextCursor: end < this.people.length ? String(end) : "",
    };
  }

  async listChannels() {
    return { channels: this.channels, nextCursor: "" };
  }

  async teamInfo() {
    return this.team;
  }

  async revokeToken() {
    this.revoked = true;
  }
}
