import { testRule } from "../test/run.mjs";

const filename = "sharing.ts";

testRule("activity-with-write", {
  message:
    "This change is one Activity records, so the two land in one batch or not at all. Hand the change to " +
    "recordChange(ctx, activityOf(ctx, { … }), change) from services/audit.ts, which records nothing when no row " +
    "changed, or undo both with takeBack. Only services/audit.ts writes the activity table.",
  valid: [
    {
      filename,
      code: "await recordChange(ctx, closed, ctx.db.update(hollers).set({ status: 'closed' }).where(isLive));",
    },
    {
      filename,
      code: "await recordChange(ctx, round, schedule, { before: [db.insert(schema.hollers).values(row)] });",
    },
    {
      filename,
      code: "await takeBack(ctx, sent, [db.update(hollers).set({ status }).where(it)]);",
    },
    { filename, code: "await db.update(hollers).set({ closeQueuedAt: null }).where(it);" },
    { filename, code: "await db.update(schema.members).set({ userId }).where(it);" },
    { filename, code: "await db.insert(schema.workspaces).values(row).onConflictDoNothing();" },
    { filename, code: "await db.update(recipients).set({ invitedAt: null }).where(it);" },
    { filename, code: "const rows = await db.select().from(schema.activity);" },
    { filename, code: "seen.delete(id);" },
  ],
  invalid: [
    {
      filename,
      code: "await ctx.db.update(hollers).set({ status: 'closed' }).where(isLive).returning();",
      errors: ["ctx.db.update(hollers)"],
    },
    {
      filename,
      code: "await runBatch(db, [db.update(schema.hollers).set({ status: 'scheduled' }).where(isDraft)]);",
      errors: ["db.update(schema.hollers)"],
    },
    {
      filename,
      code: "await ctx.db.delete(schema.viewers).where(it); await record(ctx);",
      errors: ["ctx.db.delete(schema.viewers)"],
    },
    {
      filename,
      code: "const [added] = await ctx.db.insert(viewers).values(row).onConflictDoNothing().returning();",
      errors: ["ctx.db.insert(viewers)"],
    },
    {
      filename,
      code: "await ctx.db.update(hollers).set({ reportToken }).where(it);",
      errors: ["ctx.db.update(hollers)"],
    },
    {
      filename,
      code: "await db.update(workspaces).set(next).where(it);",
      errors: ["db.update(workspaces)"],
    },
    {
      filename,
      code: "await db.update(workspaces).set({ ...next }).where(it);",
      errors: ["db.update(workspaces)"],
    },
    {
      filename,
      code: "await db.delete(schema.apikey).where(it);",
      errors: ["db.delete(schema.apikey)"],
    },
    {
      filename,
      code: "await db.insert(schema.activity).values(row);",
      errors: ["db.insert(schema.activity)"],
    },
    {
      filename,
      code: "const { activity } = schema; await recordChange(ctx, done, db.delete(activity).where(it));",
      errors: ["db.delete(activity)"],
    },
    {
      filename,
      code: "await db.run(sql`insert into activity (id) values (${id})`);",
      errors: ["`insert into activity (id) values (${"],
    },
    {
      filename,
      code: "await raw.prepare('delete from activity').run();",
      errors: ["'delete from activity'"],
    },
  ],
});
