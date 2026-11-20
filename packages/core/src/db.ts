// The one copy of Drizzle the workspace uses. Better Auth pulls in Kysely, and pnpm would
// otherwise build two Drizzles with incompatible types. Import Drizzle from here, never directly.
export * from "drizzle-orm";
export type { BatchItem } from "drizzle-orm/batch";
export { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
