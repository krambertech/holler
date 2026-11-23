import { newId } from "@holler/core";
import { and, eq } from "@holler/core/db";
import type { Auth } from "../auth";
import { type Db, schema } from "../db";
import {
  DEV_PASSWORD,
  DEV_TEAM_ID,
  type PersonaName,
  personas,
  seedDevWorkspace,
  seedLeadHollers,
} from "./dev-seed";

export function isPersona(name: string): name is PersonaName {
  return Object.hasOwn(personas, name);
}

export const DEV_WORKSPACE_HEADER = "x-holler-dev-workspace";

export interface DevWorkspace {
  teamId: string;
  emailFor: (persona: PersonaName) => string;
}

export function devWorkspace(key: string | undefined): DevWorkspace | null {
  if (key === undefined) {
    return { teamId: DEV_TEAM_ID, emailFor: (persona) => personas[persona].email };
  }
  if (!/^[a-z0-9]{8,32}$/.test(key)) return null;
  return {
    teamId: `${DEV_TEAM_ID}${key.toUpperCase()}`,
    emailFor: (persona) => personas[persona].email.replace("@", `.${key}@`),
  };
}

export async function ensurePersonas(
  db: Db,
  auth: Auth,
  workspace: DevWorkspace,
  wanted: PersonaName,
  now: Date,
) {
  for (const name of Object.keys(personas).filter(isPersona)) {
    await ensurePersona(db, auth, workspace, name, now);
  }
  return { email: workspace.emailFor(wanted), password: DEV_PASSWORD };
}

async function ensurePersona(
  db: Db,
  auth: Auth,
  workspace: DevWorkspace,
  name: PersonaName,
  now: Date,
) {
  const persona = personas[name];
  const email = workspace.emailFor(name);
  const { workspaceId } = await seedDevWorkspace(db, workspace.teamId);
  let user = await db.query.user.findFirst({ where: eq(schema.user.email, email) });
  if (!user) {
    const person = await db.query.slackPeople.findFirst({
      where: and(
        eq(schema.slackPeople.workspaceId, workspaceId),
        eq(schema.slackPeople.slackUserId, persona.slackUserId),
      ),
    });
    try {
      await auth.api.signUpEmail({
        body: { email, password: DEV_PASSWORD, name: person?.name ?? name },
      });
    } catch {
      // Another request made the same persona a moment ago; the read below finds it.
    }
    user = await db.query.user.findFirst({ where: eq(schema.user.email, email) });
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
}
