export interface D1Call {
  how: "all" | "raw" | "batch";
  statements: { sql: string; params: unknown[] }[];
}

export type D1Reply = { value: unknown } | { error: string };

async function answer(call: D1Call, db: D1Database): Promise<D1Reply> {
  try {
    const prepared = call.statements.map(({ sql, params }) => db.prepare(sql).bind(...params));
    if (call.how === "batch") return { value: await db.batch(prepared) };
    const [only] = prepared;
    if (!only) return { error: "No statement" };
    return { value: call.how === "raw" ? await only.raw() : await only.all() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export default {
  async fetch(request, env) {
    const call = await request.json<D1Call>();
    return Response.json(await answer(call, env.DB));
  },
} satisfies ExportedHandler<{ DB: D1Database }>;
