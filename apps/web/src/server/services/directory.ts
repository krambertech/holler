import { foldText, matchTier, parseSearch, rankMatches, type SearchQuery } from "@holler/core";
import { and, asc, eq, inArray, isNull, type SQL, sql } from "@holler/core/db";
import { schema } from "../db";
import type { ServiceContext } from "./context";

/** Rows each kind reads before ranking, so the best matches survive the cut. */
const CANDIDATES = 60;

const personColumns = {
  slackUserId: schema.slackPeople.slackUserId,
  name: schema.slackPeople.name,
  displayName: schema.slackPeople.displayName,
  avatarUrl: schema.slackPeople.avatarUrl,
  timeZone: schema.slackPeople.timeZone,
};

const groupColumns = {
  slackId: schema.slackGroups.slackId,
  kind: schema.slackGroups.kind,
  name: schema.slackGroups.name,
  handle: schema.slackGroups.handle,
  memberCount: schema.slackGroups.memberCount,
};

type SearchColumn = typeof schema.slackPeople.searchName | typeof schema.slackGroups.searchName;

/** Every word typed is in the folded name. */
function contains(column: SearchColumn, tokens: readonly string[]): SQL | undefined {
  return tokens.length
    ? and(...tokens.map((token) => sql`instr(${column}, ${token}) > 0`))
    : undefined;
}

/**
 * A coarse order for SQL, so the best matches survive the limit: the name starts with it, a word
 * starts with it, then the rest; then the ones this sender sends to most. `rankMatches` refines it.
 */
function ordering(column: SearchColumn, tokens: readonly string[]): SQL[] {
  const [first] = tokens;
  const byName = [sql`"sends" desc`, asc(column)];
  if (!first) return byName;
  return [
    sql`case when instr(${column}, ${tokens.join(" ")}) = 1 then 0 when instr(' ' || ${column}, ${` ${first}`}) > 0 then 1 else 2 end`,
    ...byName,
  ];
}

function senderOf(ctx: ServiceContext): string | null {
  return "memberId" in ctx.actor && ctx.actor.memberId ? ctx.actor.memberId : null;
}

/** How many of this sender's hollers went to each person. */
function personSends(ctx: ServiceContext, sender: string | null): SQL<number> {
  if (!sender) return sql<number>`0`;
  return sql<number>`(select count(*) from ${schema.recipients} r join ${schema.hollers} h on h.id = r.holler_id where h.workspace_id = ${ctx.workspaceId} and h.creator_id = ${sender} and r.slack_user_id = "slack_people"."slack_user_id")`;
}

/** How many of this sender's sent hollers named each group in their audience. */
function groupSends(ctx: ServiceContext, sender: string | null): SQL<number> {
  if (!sender) return sql<number>`0`;
  return sql<number>`(select count(*) from ${schema.hollers} h, json_each(h.audience, '$.groups') g where h.workspace_id = ${ctx.workspaceId} and h.creator_id = ${sender} and h.status != 'draft' and g.value = "slack_groups"."slack_id")`;
}

function findPeople(ctx: ServiceContext, query: SearchQuery, limit = CANDIDATES) {
  const sender = senderOf(ctx);
  return ctx.db
    .select({ ...personColumns, sends: personSends(ctx, sender).as("sends") })
    .from(schema.slackPeople)
    .where(
      and(
        eq(schema.slackPeople.workspaceId, ctx.workspaceId),
        eq(schema.slackPeople.isBot, false),
        eq(schema.slackPeople.isDeleted, false),
        contains(schema.slackPeople.searchName, query.tokens),
      ),
    )
    .orderBy(...ordering(schema.slackPeople.searchName, query.tokens))
    .limit(limit);
}

function findGroups(ctx: ServiceContext, query: SearchQuery, limit = CANDIDATES) {
  const sender = senderOf(ctx);
  return ctx.db
    .select({ ...groupColumns, sends: groupSends(ctx, sender).as("sends") })
    .from(schema.slackGroups)
    .where(
      and(
        eq(schema.slackGroups.workspaceId, ctx.workspaceId),
        query.scope === "channels" ? eq(schema.slackGroups.kind, "channel") : undefined,
        query.scope === "handles" ? eq(schema.slackGroups.kind, "usergroup") : undefined,
        contains(schema.slackGroups.searchName, query.tokens),
      ),
    )
    .orderBy(...ordering(schema.slackGroups.searchName, query.tokens))
    .limit(limit);
}

type FoundPerson = Awaited<ReturnType<typeof findPeople>>[number];
type FoundGroup = Awaited<ReturnType<typeof findGroups>>[number];

const personNames = (p: FoundPerson) => ({
  names: [p.name, p.displayName],
  sends: p.sends,
  label: p.name,
});
const groupNames = (g: FoundGroup) => ({
  names: [g.name, g.handle],
  sends: g.sends,
  label: g.name,
});

/** True while the first read of the workspace's directory is still under way. */
async function firstSyncRunning(ctx: ServiceContext) {
  const sync = await ctx.db.query.directorySyncs.findFirst({
    where: and(
      eq(schema.directorySyncs.workspaceId, ctx.workspaceId),
      isNull(schema.directorySyncs.completedAt),
    ),
  });
  return Boolean(sync?.runStartedAt);
}

/**
 * People and groups for the audience picker, from Holler's copy of the Slack directory, best
 * match first. Every word typed must be in a name; a name that starts with it beats one it is
 * inside, and people this sender sends to often come before the rest. `@` searches handles and
 * `#` channels. Keeping the copy fresh is the directory sync's job (docs/slack.md).
 */
export async function searchDirectory(ctx: ServiceContext, query: string, limit = 20) {
  const parsed = parseSearch(query);
  const [people, groups, syncing] = await Promise.all([
    parsed.scope === "channels" ? [] : findPeople(ctx, parsed),
    findGroups(ctx, parsed),
    firstSyncRunning(ctx),
  ]);
  return {
    people: rankMatches(people, parsed.tokens, personNames).slice(0, limit),
    groups: rankMatches(groups, parsed.tokens, groupNames).slice(0, Math.ceil(limit / 2)),
    syncing,
  };
}

/** Every word typed is a whole word of one of the names. */
function namesWholeWords(names: readonly (string | null | undefined)[], tokens: readonly string[]) {
  const words = new Set(names.flatMap((name) => (name ? foldText(name).split(" ") : [])));
  return tokens.length > 0 && tokens.every((token) => words.has(token));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Terms per round trip: each name is two statements in one D1 batch. */
const CHUNK = 25;
/** Rows each term reads: enough to tell one match from several. */
const PER_TERM = 20;

/**
 * Pasted names, handles and emails, each matched to the one person or group it names. Every term
 * runs its own search, in any word order, so no term's matches crowd out another's. A term
 * matches when exactly one result is its best whole-word match; anything else comes back
 * missed, as matching nobody or several.
 */
export async function resolveDirectory(ctx: ServiceContext, terms: readonly string[]) {
  const wanted = [...new Map(terms.map((term) => [foldText(term), term.trim()])).values()]
    .filter(Boolean)
    .slice(0, 100);
  const people = new Map<string, FoundPerson>();
  const groups = new Map<string, FoundGroup>();
  const missed: { term: string; reason: "none" | "several" }[] = [];

  for (let i = 0; i < wanted.length; i += CHUNK) {
    const chunk = wanted.slice(i, i + CHUNK);
    const emails = chunk.filter((term) => EMAIL.test(term));
    const names = chunk
      .filter((term) => !EMAIL.test(term))
      .map((term) => ({ term, query: parseSearch(term) }))
      .filter(({ query }) => query.tokens.length > 0);

    const byEmail = emails.length
      ? await ctx.db
          .select({ ...personColumns, email: schema.slackPeople.email })
          .from(schema.slackPeople)
          .where(
            and(
              eq(schema.slackPeople.workspaceId, ctx.workspaceId),
              eq(schema.slackPeople.isBot, false),
              eq(schema.slackPeople.isDeleted, false),
              inArray(schema.slackPeople.email, [
                ...new Set(emails.flatMap((e) => [e, e.toLocaleLowerCase()])),
              ]),
            ),
          )
      : [];
    for (const term of emails) {
      const folded = term.toLocaleLowerCase();
      const hits = byEmail.filter((p) => p.email?.toLocaleLowerCase() === folded);
      const [hit] = hits;
      if (hits.length === 1 && hit) {
        const { email: _, ...person } = hit;
        people.set(person.slackUserId, { ...person, sends: 0 });
      } else {
        missed.push({ term, reason: hits.length ? "several" : "none" });
      }
    }

    const found = await searchEach(
      ctx,
      names.map(({ query }) => query),
    );
    names.forEach(({ term, query }, index) => {
      const { people: foundPeople, groups: foundGroups } = found[index] ?? {
        people: [],
        groups: [],
      };
      const candidates = [
        ...(query.scope === "channels" ? [] : foundPeople).map((p) => ({
          kind: "person" as const,
          about: personNames(p),
          person: p,
        })),
        ...foundGroups.map((g) => ({ kind: "group" as const, about: groupNames(g), group: g })),
      ];
      // A paste names people in full: whole words only, so "ma" does not quietly add Marta.
      const whole = rankMatches(candidates, query.tokens, (c) => c.about).filter((c) =>
        namesWholeWords(c.about.names, query.tokens),
      );
      const [best, next] = whole;
      const tierOf = (c: (typeof whole)[number]) => matchTier(c.about.names, query.tokens);
      if (!best) {
        missed.push({ term, reason: "none" });
      } else if (next && tierOf(next) === tierOf(best)) {
        missed.push({ term, reason: "several" });
      } else if (best.kind === "person") {
        people.set(best.person.slackUserId, best.person);
      } else {
        groups.set(best.group.slackId, best.group);
      }
    });
  }
  return { people: [...people.values()], groups: [...groups.values()], missed };
}

/** Each query's own people and groups, in one D1 batch. */
async function searchEach(ctx: ServiceContext, queries: readonly SearchQuery[]) {
  const statements = queries.flatMap((query) => [
    findPeople(ctx, query, PER_TERM),
    findGroups(ctx, query, PER_TERM),
  ]);
  const [first, ...rest] = statements;
  if (!first) return [];
  const results = (await ctx.db.batch([first, ...rest])) as unknown[];
  return queries.map((_, index) => ({
    people: (results[index * 2] ?? []) as FoundPerson[],
    groups: (results[index * 2 + 1] ?? []) as FoundGroup[],
  }));
}

/**
 * The people and groups a saved audience names, so a reopened draft shows names, not ids.
 * Deleted people still come back, so a chip can say who it was.
 */
export async function lookupDirectory(ctx: ServiceContext, ids: readonly string[]) {
  const wanted = [...new Set(ids)].slice(0, 200);
  if (wanted.length === 0) return { people: [], groups: [] };
  // D1 binds at most 100 values in one statement.
  const chunks: string[][] = [];
  for (let i = 0; i < wanted.length; i += 90) chunks.push(wanted.slice(i, i + 90));
  const people = [];
  const groups = [];
  for (const chunk of chunks) {
    people.push(
      ...(await ctx.db
        .select({
          slackUserId: schema.slackPeople.slackUserId,
          name: schema.slackPeople.name,
          displayName: schema.slackPeople.displayName,
          avatarUrl: schema.slackPeople.avatarUrl,
          timeZone: schema.slackPeople.timeZone,
        })
        .from(schema.slackPeople)
        .where(
          and(
            eq(schema.slackPeople.workspaceId, ctx.workspaceId),
            inArray(schema.slackPeople.slackUserId, chunk),
          ),
        )),
    );
    groups.push(
      ...(await ctx.db
        .select({
          slackId: schema.slackGroups.slackId,
          kind: schema.slackGroups.kind,
          name: schema.slackGroups.name,
          handle: schema.slackGroups.handle,
          memberCount: schema.slackGroups.memberCount,
        })
        .from(schema.slackGroups)
        .where(
          and(
            eq(schema.slackGroups.workspaceId, ctx.workspaceId),
            inArray(schema.slackGroups.slackId, chunk),
          ),
        )),
    );
  }
  return { people, groups };
}
