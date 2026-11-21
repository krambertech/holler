/**
 * The one way Holler calls Slack's Web API. Services take a `SlackClient`, so tests pass
 * `FakeSlack` from ./fake.ts and nothing reaches slack.com. Add a method here when a feature needs
 * a new Slack call; never fetch slack.com anywhere else.
 */
export interface SlackClient {
  /** Posts a message. A user id as `channel` posts to that person's DM with the bot. */
  postMessage(input: PostMessage): Promise<{ channel: string; ts: string }>;
  updateMessage(input: PostMessage & { ts: string }): Promise<void>;
  openView(input: { triggerId: string; view: SlackView }): Promise<void>;
  publishHome(input: { userId: string; view: SlackView }): Promise<void>;
  /** One page of the workspace's people. Pass the returned cursor until it is empty. */
  listUsers(cursor?: string): Promise<{ members: SlackUser[]; nextCursor: string }>;
  listUserGroups(): Promise<SlackUserGroup[]>;
  userGroupMembers(groupId: string): Promise<string[]>;
  channelMembers(
    channelId: string,
    cursor?: string,
  ): Promise<{ members: string[]; nextCursor: string }>;
  /** One page of public channels, and of private channels the bot was added to. */
  listChannels(cursor?: string): Promise<{ channels: SlackChannel[]; nextCursor: string }>;
  /** The workspace's name, subdomain and icon. Needs `team:read`. */
  teamInfo(): Promise<SlackTeam>;
  /** Revokes the token this client holds, for an install Holler refuses. */
  revokeToken(): Promise<void>;
}

export interface PostMessage {
  channel: string;
  /** The notification and screen-reader text. Always the question or the point, never decoration. */
  text: string;
  blocks?: unknown[];
}

export interface SlackView {
  type: "modal" | "home";
  blocks: unknown[];
  [key: string]: unknown;
}

export interface SlackUser {
  id: string;
  name: string;
  deleted?: boolean;
  is_bot?: boolean;
  tz?: string;
  profile?: { real_name?: string; display_name?: string; email?: string; image_72?: string };
}

export interface SlackUserGroup {
  id: string;
  name: string;
  handle: string;
  user_count?: number;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private?: boolean;
  is_archived?: boolean;
  num_members?: number;
}

export interface SlackTeam {
  id: string;
  name: string;
  domain?: string;
  icon?: { image_132?: string; image_default?: boolean };
}

/** What `oauth.v2.access` returns for an "Add to Slack" install. */
export interface SlackInstallGrant {
  appId: string;
  botUserId: string;
  botToken: string;
  scopes: string;
  teamId: string;
  teamName: string;
  /** Set when the workspace belongs to an Enterprise Grid organisation. */
  enterpriseId: string | null;
  isEnterpriseInstall: boolean;
  installerSlackUserId: string;
}

/** A Slack API answer with `ok: false`. `retryAfter` is set when Slack rate-limited the call. */
export class SlackApiError extends Error {
  constructor(
    readonly method: string,
    readonly slackError: string,
    readonly retryAfter?: number,
  ) {
    super(`Slack ${method} failed: ${slackError}`);
    this.name = "SlackApiError";
  }

  /** Errors that will not go away on a retry, such as a person who left the workspace. */
  get permanent(): boolean {
    return [
      "user_not_found",
      "channel_not_found",
      "is_archived",
      "account_inactive",
      "token_revoked",
      "invalid_auth",
      "not_in_channel",
      "cannot_dm_bot",
    ].includes(this.slackError);
  }
}

type Fetch = typeof fetch;

export function createSlackClient(token: string, fetcher: Fetch = fetch): SlackClient {
  async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetcher(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
    if (response.status === 429) {
      throw new SlackApiError(
        method,
        "ratelimited",
        Number(response.headers.get("retry-after") ?? 1),
      );
    }
    const data = (await response.json()) as { ok: boolean; error?: string } & T;
    if (!data.ok) throw new SlackApiError(method, data.error ?? "unknown_error");
    return data;
  }

  return {
    async postMessage(input) {
      const data = await call<{ channel: string; ts: string }>("chat.postMessage", { ...input });
      return { channel: data.channel, ts: data.ts };
    },
    async updateMessage(input) {
      await call("chat.update", { ...input });
    },
    async openView({ triggerId, view }) {
      await call("views.open", { trigger_id: triggerId, view });
    },
    async publishHome({ userId, view }) {
      await call("views.publish", { user_id: userId, view });
    },
    async listUsers(cursor) {
      const data = await call<{
        members: SlackUser[];
        response_metadata?: { next_cursor?: string };
      }>("users.list", { limit: 200, ...(cursor ? { cursor } : {}) });
      return { members: data.members, nextCursor: data.response_metadata?.next_cursor ?? "" };
    },
    async listUserGroups() {
      const data = await call<{ usergroups: SlackUserGroup[] }>("usergroups.list", {
        include_count: true,
      });
      return data.usergroups;
    },
    async userGroupMembers(groupId) {
      const data = await call<{ users: string[] }>("usergroups.users.list", { usergroup: groupId });
      return data.users;
    },
    async channelMembers(channelId, cursor) {
      const data = await call<{ members: string[]; response_metadata?: { next_cursor?: string } }>(
        "conversations.members",
        { channel: channelId, limit: 500, ...(cursor ? { cursor } : {}) },
      );
      return { members: data.members, nextCursor: data.response_metadata?.next_cursor ?? "" };
    },
    async listChannels(cursor) {
      const data = await call<{
        channels: SlackChannel[];
        response_metadata?: { next_cursor?: string };
      }>("conversations.list", {
        types: "public_channel,private_channel",
        exclude_archived: true,
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });
      return { channels: data.channels, nextCursor: data.response_metadata?.next_cursor ?? "" };
    },
    async teamInfo() {
      const data = await call<{ team: SlackTeam }>("team.info", {});
      return data.team;
    },
    async revokeToken() {
      await call("auth.revoke", {});
    },
  };
}

/**
 * Trades the code from Slack's install redirect for the bot token. This is the one Slack call made
 * without a token, so it lives beside the client rather than on it.
 * https://docs.slack.dev/reference/methods/oauth.v2.access
 */
export async function exchangeInstallCode(
  input: { code: string; redirectUri: string; clientId: string; clientSecret: string },
  fetcher: Fetch = fetch,
): Promise<SlackInstallGrant> {
  const response = await fetcher("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    }),
  });
  const data = (await response.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    scope?: string;
    bot_user_id?: string;
    app_id?: string;
    team?: { id: string; name: string } | null;
    enterprise?: { id: string; name: string } | null;
    is_enterprise_install?: boolean;
    authed_user?: { id: string };
  };
  if (!data.ok) throw new SlackApiError("oauth.v2.access", data.error ?? "unknown_error");
  if (!data.access_token || !data.bot_user_id || !data.app_id || !data.authed_user) {
    throw new SlackApiError("oauth.v2.access", "missing_bot_token");
  }
  return {
    appId: data.app_id,
    botUserId: data.bot_user_id,
    botToken: data.access_token,
    scopes: data.scope ?? "",
    teamId: data.team?.id ?? "",
    teamName: data.team?.name ?? "",
    enterpriseId: data.enterprise?.id ?? null,
    isEnterpriseInstall: data.is_enterprise_install === true,
    installerSlackUserId: data.authed_user.id,
  };
}
