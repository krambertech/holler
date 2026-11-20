import type { PostMessage, SlackClient, SlackUser, SlackUserGroup, SlackView } from "./client";

/**
 * An in-memory Slack for tests and local development. It records every call, so a test asserts
 * on what Holler would have sent, and it answers directory calls from the people it was given.
 */
export class FakeSlack implements SlackClient {
  readonly posted: (PostMessage & { ts: string })[] = [];
  readonly updated: (PostMessage & { ts: string })[] = [];
  readonly views: { triggerId: string; view: SlackView }[] = [];
  readonly homes: { userId: string; view: SlackView }[] = [];
  private counter = 0;

  constructor(
    readonly people: SlackUser[] = [],
    readonly groups: (SlackUserGroup & { members: string[] })[] = [],
  ) {}

  async postMessage(input: PostMessage) {
    const ts = `${1_700_000_000 + this.counter++}.000100`;
    this.posted.push({ ...input, ts });
    return {
      channel: input.channel.startsWith("U") ? `D${input.channel.slice(1)}` : input.channel,
      ts,
    };
  }

  async updateMessage(input: PostMessage & { ts: string }) {
    this.updated.push(input);
  }

  async openView(input: { triggerId: string; view: SlackView }) {
    this.views.push(input);
  }

  async publishHome(input: { userId: string; view: SlackView }) {
    this.homes.push(input);
  }

  async listUsers() {
    return { members: this.people, nextCursor: "" };
  }

  async listUserGroups() {
    return this.groups;
  }

  async userGroupMembers(groupId: string) {
    return this.groups.find((g) => g.id === groupId)?.members ?? [];
  }

  async channelMembers() {
    return { members: this.people.map((p) => p.id), nextCursor: "" };
  }
}
