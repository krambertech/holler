import { Agent, request } from "node:http";
import { fileURLToPath } from "node:url";
import { createTestHarness } from "wrangler";
import { migrationStatements } from "../test-db";
import type { D1Call, D1Reply } from "./d1-bridge";
import { type Life, type Step, stepOf } from "./life";

export type CallD1 = (how: D1Call["how"], statements: D1Call["statements"]) => Promise<unknown>;

export type Stored = Record<string, Record<string, unknown>[]>;

export interface LocalD1 {
  call: CallD1;
  dump: () => Promise<Stored>;
  restore: (stored: Stored) => Promise<void>;
}

const agent = new Agent({ keepAlive: true });

function post(url: URL, call: D1Call): Promise<D1Reply> {
  const body = JSON.stringify(call);
  const headers = { "content-length": Buffer.byteLength(body) };
  return new Promise((resolve, reject) => {
    request(url, { method: "POST", agent, headers }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (text += chunk));
      response.on("end", () => resolve(JSON.parse(text)));
    })
      .on("error", reject)
      .end(body);
  });
}

const plain = (sql: string, params: unknown[] = []) => ({ sql, params });

async function startD1() {
  const server = createTestHarness({
    workers: [
      {
        config: {
          name: "crash-sweep-d1",
          main: fileURLToPath(new URL("./d1-bridge.ts", import.meta.url)),
          compatibility_date: "2026-11-01",
          d1_databases: [{ binding: "DB", database_name: "sweep", database_id: "sweep" }],
        },
      },
    ],
  });
  const { url } = await server.listen();
  const call: CallD1 = async (how, statements) => {
    const reply = await post(url, { how, statements });
    if ("error" in reply) throw new Error(`D1_ERROR: ${reply.error}`);
    return reply.value;
  };
  const batch = async (statements: D1Call["statements"]) =>
    (await call("batch", statements)) as { results: Record<string, unknown>[] }[];

  await batch(migrationStatements().map((sql) => plain(sql)));
  const [list] = await batch([
    plain(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite%' and name not like '\\_%' escape '\\'",
    ),
  ]);
  const tables = (list?.results ?? []).map((row) => String(row.name));

  const d1: LocalD1 = {
    call,
    dump: async () => {
      const dumped = await batch(tables.map((table) => plain(`select * from "${table}"`)));
      return Object.fromEntries(
        tables.map((table, index) => [table, dumped[index]?.results ?? []]),
      );
    },
    restore: async (stored) => {
      await batch([
        plain("pragma defer_foreign_keys = on"),
        ...tables.map((table) => plain(`delete from "${table}"`)),
        ...Object.entries(stored).flatMap(([table, rows]) =>
          rows.map((row) =>
            plain(
              `insert into "${table}" (${Object.keys(row)
                .map((column) => `"${column}"`)
                .join(", ")}) values (${Object.keys(row)
                .map(() => "?")
                .join(", ")})`,
              Object.values(row),
            ),
          ),
        ),
      ]);
    },
  };
  return { d1, close: () => server.close() };
}

export async function localD1s(count: number) {
  const started = await Promise.all(Array.from({ length: count }, startD1));
  const free = started.map(({ d1 }) => d1);
  const waiting: ((d1: LocalD1) => void)[] = [];

  async function borrow<T>(use: (d1: LocalD1) => Promise<T>): Promise<T> {
    const d1 = free.pop() ?? (await new Promise<LocalD1>((resolve) => waiting.push(resolve)));
    try {
      return await use(d1);
    } finally {
      const next = waiting.shift();
      if (next) next(d1);
      else free.push(d1);
    }
  }

  return { borrow, close: () => Promise.all(started.map(({ close }) => close())) };
}

function stepFor(statements: D1Call["statements"]): Step {
  return stepOf(statements.map((statement) => statement.sql));
}

export function d1Within(life: Life, call: CallD1): D1Database {
  const send = (how: D1Call["how"], statements: D1Call["statements"]) =>
    life.step(
      stepFor(statements),
      () => call(how, statements),
      () => new Error("D1 is down"),
    );
  const statement = (sql: string, params: unknown[]) => ({
    sql,
    params,
    bind: (...values: unknown[]) => statement(sql, values),
    all: () => send("all", [{ sql, params }]),
    run: () => send("all", [{ sql, params }]),
    raw: () => send("raw", [{ sql, params }]),
  });
  return {
    prepare: (sql: string) => statement(sql, []),
    batch: (list: D1Call["statements"]) =>
      send(
        "batch",
        list.map(({ sql, params }) => ({ sql, params })),
      ),
  } as unknown as D1Database;
}
