import { newId } from "@holler/core";
import { and, eq } from "@holler/core/db";
import type { Auth } from "../auth";
import { type Db, schema } from "../db";
import {
  DEV_PASSWORD,
  type PersonaName,
  personas,
  seedDevWorkspace,
  seedLeadHollers,
} from "./dev-seed";

export function isPersona(name: string): name is PersonaName {
  return Object.hasOwn(personas, name);
}

/** Makes the persona's user, member and seed data if they are missing. Dev routes only. */
export async function ensurePersona(db: Db, auth: Auth, name: PersonaName, now: Date) {
  const persona = personas[name];
  const { workspaceId } = await seedDevWorkspace(db);
  let user = await db.query.user.findFirst({ where: eq(schema.user.email, persona.email) });
  if (!user) {
    const person = await db.query.slackPeople.findFirst({
      where: and(
        eq(schema.slackPeople.workspaceId, workspaceId),
        eq(schema.slackPeople.slackUserId, persona.slackUserId),
      ),
    });
    try {
      await auth.api.signUpEmail({
        body: { email: persona.email, password: DEV_PASSWORD, name: person?.name ?? name },
      });
    } catch {
      // Another request made the same persona a moment ago; the read below finds it.
    }
    user = await db.query.user.findFirst({ where: eq(schema.user.email, persona.email) });
    if (!user) throw new Error(`Could not create the ${name} persona`);
  }
  let member = await db.query.members.findFirst({ where: eq(schema.members.userId, user.id) });
  if (!member) {
    const id = newId("member");
    await db
      .insert(schema.members)
      .values({
        id,
        workspaceId,
        userId: user.id,
        slackUserId: persona.slackUserId,
        role: persona.role,
      })
      .onConflictDoNothing();
    member = await db.query.members.findFirst({ where: eq(schema.members.userId, user.id) });
  }
  if (name === "lead" && member) await seedLeadHollers(db, workspaceId, member.id, now);
  return { email: persona.email, password: DEV_PASSWORD };
}
