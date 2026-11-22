export interface Step {
  label: string;
  writes: boolean;
}

export interface Fault {
  killBefore?: number;
  killAfter?: number;
  refuse?: number;
}

export type Ending = { how: "finished" } | { how: "killed" } | { how: "threw"; error: unknown };

const never = new Promise<never>(() => {});

export class Life {
  readonly writes: string[] = [];
  private dead = false;
  private readonly inFlight = new Set<Promise<unknown>>();
  private readonly death: Promise<Ending>;
  private tellDeath: (ending: Ending) => void = () => {};

  constructor(readonly fault: Fault = {}) {
    this.death = new Promise((resolve) => {
      this.tellDeath = resolve;
    });
  }

  async step<T>(step: Step, act: () => Promise<T>, refusal: () => Error): Promise<T> {
    if (this.dead) return never;
    const at = step.writes ? this.writes.push(step.label) : 0;
    if (at > 0 && at === this.fault.killBefore) return this.die();
    if (at > 0 && at === this.fault.refuse) throw refusal();
    const running = act();
    this.inFlight.add(running);
    try {
      const result = await running;
      if (this.dead) return await never;
      if (at > 0 && at === this.fault.killAfter) return await this.die();
      return result;
    } catch (error) {
      if (this.dead) return await never;
      throw error;
    } finally {
      this.inFlight.delete(running);
    }
  }

  private die(): Promise<never> {
    this.dead = true;
    this.tellDeath({ how: "killed" });
    return never;
  }

  async live(act: () => Promise<unknown>): Promise<Ending> {
    const ending = await Promise.race([
      act().then(
        (): Ending => ({ how: "finished" }),
        (error: unknown): Ending => ({ how: "threw", error }),
      ),
      this.death,
    ]);
    await Promise.allSettled(this.inFlight);
    return ending;
  }
}

export function stepOf(sqls: string[]): Step {
  const written = [...new Set(sqls.flatMap((sql) => writeIn(sql) ?? []))];
  return { label: written.join(" + ") || "read", writes: written.length > 0 };
}

const words = (table = "") => table.replaceAll("_", " ");

function writeIn(sql: string): string | null {
  const insert = /^\s*insert into "(\w+)"/i.exec(sql);
  if (insert) return `insert ${words(insert[1])}`;
  const remove = /^\s*delete from "?(\w+)"?/i.exec(sql);
  if (remove) return `delete ${words(remove[1])}`;
  const update = /^\s*update "(\w+)" set (.*?)(?: where |$)/is.exec(sql);
  if (update) {
    const columns = [...(update[2] ?? "").matchAll(/"(\w+)" = /g)].map((match) => match[1]);
    return `update ${words(update[1])}: ${columns.join(", ")}`;
  }
  return /^\s*select\b/i.test(sql) ? null : sql.slice(0, 60);
}
