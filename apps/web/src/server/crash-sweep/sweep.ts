import { ServiceError } from "../services/context";
import type { SlackSend } from "../services/delivery";
import type { KnownWindow } from "./known-windows";
import { type Ending, type Fault, Life } from "./life";
import type { LocalD1 } from "./local-d1";
import { brokenPromises, type PromiseId, promises } from "./promises";
import type { Operation, Scenario } from "./scenarios";
import { BASE, fingerprint, World } from "./world";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const soonPasses = [1, 4, 40].map((count) => count * MINUTE);
const closePasses = [0, 3].map((count) => count * MINUTE);
const shortLife = 5 * HOUR;
const longLife = 168 * HOUR + 10 * MINUTE;
const reminderPasses = [24, 72, 120].map((count) => count * HOUR + 10 * MINUTE);

export interface Run {
  failure: string;
  ending: Ending["how"];
  writes: string[];
  broken: PromiseId[];
  posted: string[];
}

const later = (at: Date, ms: number) => new Date(at.getTime() + ms);

async function settle(world: World, at: Date): Promise<PromiseId[]> {
  for (const wait of soonPasses) await world.cron(later(at, wait));
  const soon = later(at, soonPasses.at(-1) ?? 0);
  const broken = new Set(await brokenPromises(world, soon, "soon"));
  const ends = world.remindsPeople
    ? [...reminderPasses, ...closePasses.map((wait) => longLife + wait)]
    : closePasses.map((wait) => shortLife + wait);
  const passes = ends.map((wait) => later(BASE, wait)).filter((pass) => pass > soon);
  for (const pass of passes) await world.cron(pass);
  for (const id of await brokenPromises(world, passes.at(-1) ?? soon, "end")) broken.add(id);
  return [...broken];
}

async function redo(world: World, operation: Operation, at: Date): Promise<void> {
  try {
    await operation.act(world.side(), at);
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
  }
}

export async function sweep(d1: LocalD1, scenario: Scenario): Promise<Run[]> {
  const world = await World.create(d1);
  const operation = await scenario.arrange(world);
  const start = await world.snapshot();
  const settled = new Map<string, Promise<Pick<Run, "broken" | "posted">>>();

  async function recover(redone: boolean) {
    const at = later(operation.at, MINUTE / 2);
    if (redone) await redo(world, operation, at);
    await world.drain(at);
    const broken = await settle(world, operation.at);
    const posted = world.posts.slice(start.posts.length).map((post) => post.key);
    return { broken, posted };
  }

  async function run(failure: string, fault: Fault): Promise<Run> {
    await world.restore(start);
    const life = new Life(fault);
    const side = world.side(life);
    const ending = await world.within(life, () =>
      life.live(() => operation.act(side, operation.at)),
    );
    if (ending.how === "threw" && fault.refuse === undefined) throw ending.error;
    const redone = operation.redone && ending.how !== "finished";
    const left = `${redone} ${fingerprint(await world.snapshot(), start)}`;
    const recovered = settled.get(left) ?? recover(Boolean(redone));
    settled.set(left, recovered);
    return { failure, ending: ending.how, writes: life.writes, ...(await recovered) };
  }

  async function kill(failure: string, fault: Fault): Promise<Run> {
    const outcome = await run(failure, fault);
    if (outcome.ending !== "killed") {
      throw new Error(`${scenario.operation} never reached: ${failure}`);
    }
    return outcome;
  }

  const whole = await run("no failure", {});
  const runs = [whole, await kill(`killed before ${whole.writes[0]}`, { killBefore: 1 })];
  for (const [index, label] of whole.writes.entries()) {
    runs.push(await kill(`killed after ${label}`, { killAfter: index + 1 }));
  }
  for (const [index, label] of whole.writes.entries()) {
    const refused = await run(`${label} refused`, { refuse: index + 1 });
    runs.push(refused);
    for (let next = index + 2; next <= refused.writes.length; next += 1) {
      runs.push(
        await kill(`${label} refused, killed after ${refused.writes[next - 1]}`, {
          refuse: index + 1,
          killAfter: next,
        }),
      );
    }
  }
  return runs;
}

export type Posting = "at most once" | "at least once" | "exactly once" | "lost or doubled";

export function postingOf(kind: SlackSend["kind"], runs: Run[]): Posting {
  const [whole] = runs;
  const key = whole?.posted.find((posted) => posted.startsWith(`post:${kind}:`));
  const step = whole?.writes.indexOf(`Slack posts ${kind}`) ?? -1;
  if (!whole || !key || step < 1) throw new Error(`${kind} claims its post, then posts it`);
  const times = (write: number) =>
    runs
      .find((run) => run.failure === `killed after ${whole.writes[write]}`)
      ?.posted.filter((posted) => posted === key).length;
  const lost = times(step - 1) === 0;
  const doubled = times(step) !== 1;
  if (lost && doubled) return "lost or doubled";
  if (lost) return "at most once";
  return doubled ? "at least once" : "exactly once";
}

const windowKey = (failure: string, id: PromiseId) => `${failure} | ${id}`;

export function windowProblems(operation: string, runs: Run[], known: KnownWindow[]): string[] {
  const listed = new Set(
    known
      .filter((window) => window.operation === operation)
      .flatMap((window) => window.breaks.map((id) => windowKey(window.failure, id))),
  );
  const found = new Map(
    runs.flatMap(({ failure, broken }) =>
      broken.map((id) => [windowKey(failure, id), { failure, id }] as const),
    ),
  );
  const opened = [...found].flatMap(([key, { failure, id }]) =>
    listed.has(key)
      ? []
      : [
          `New crash window in ${operation}. Failure: ${failure}. Broken: ${promises[id]}. Fix: derive this work from stored state in a cron pass, or write it in the same batch.`,
        ],
  );
  const closed = [...listed].flatMap((key) =>
    found.has(key)
      ? []
      : [`Crash window closed in ${operation}. Delete its line from known-windows.ts: ${key}`],
  );
  return [...opened, ...closed];
}
