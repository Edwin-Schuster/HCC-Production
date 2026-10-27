import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { people, teamRoles, users, workspaceMembers } from "@/db/schema";
import { PERSON_STATUSES, type PersonStatus } from "@/lib/roster";
import { forbidden, invalid, notFound } from "@/server/errors";
import { atLeast, type Actor } from "@/server/permissions";

/**
 * The production roster: who is on the team, what roles they fill, and where they are.
 * Every member can read it and check themselves in; editors maintain it.
 */

const Color = z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour");

export type RosterPerson = {
  id: string;
  name: string;
  roleIds: string[];
  email: string;
  phone: string;
  status: PersonStatus;
  statusNote: string;
  lastCheckIn: string | null;
  userId: string | null;
};
export type RosterRole = { id: string; name: string; description: string; color: string };

function requireMember(actor: Actor) {
  if (!atLeast(actor, "viewer")) throw forbidden("Sign in to see the roster.");
}
function requireEditor(actor: Actor) {
  if (!atLeast(actor, "editor")) throw forbidden("Only editors can change the roster.");
}

const toPerson = (p: typeof people.$inferSelect): RosterPerson => ({
  id: p.id,
  name: p.name,
  roleIds: p.roleIds,
  email: p.email,
  phone: p.phone,
  status: (PERSON_STATUSES as readonly string[]).includes(p.status) ? (p.status as PersonStatus) : "available",
  statusNote: p.statusNote,
  lastCheckIn: p.lastCheckIn?.toISOString() ?? null,
  userId: p.userId,
});

export async function listRoles(db: Executor, actor: Actor): Promise<RosterRole[]> {
  requireMember(actor);
  return db
    .select({ id: teamRoles.id, name: teamRoles.name, description: teamRoles.description, color: teamRoles.color })
    .from(teamRoles)
    .where(eq(teamRoles.workspaceId, actor.workspaceId))
    .orderBy(asc(teamRoles.name));
}

export async function listRoster(db: Executor, actor: Actor) {
  requireMember(actor);
  const [rows, roles] = await Promise.all([db.select().from(people).where(eq(people.workspaceId, actor.workspaceId)).orderBy(asc(people.name)), listRoles(db, actor)]);
  const list = rows.map(toPerson);
  return { people: list, roles, me: list.find((p) => p.userId && p.userId === actor.userId) ?? null };
}

/** Accounts an editor can link a roster entry to, so that person can check themselves in. */
export async function linkableUsers(db: Executor, actor: Actor) {
  requireEditor(actor);
  return db
    .select({ id: users.id, name: users.name, username: users.username })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, actor.workspaceId), eq(users.disabled, false)))
    .orderBy(asc(users.name));
}

export const PersonInput = z.object({
  name: z.string().trim().min(1, "Give them a name").max(120),
  roleIds: z.array(z.string().max(64)).max(30).default([]),
  email: z.union([z.literal(""), z.string().trim().email("That email doesn't look right").max(200)]).default(""),
  phone: z.string().trim().max(40).default(""),
  userId: z.string().max(64).nullable().default(null),
});

async function checkRefs(db: Executor, actor: Actor, data: z.output<typeof PersonInput>, personId?: string) {
  const roleIds = new Set((await listRoles(db, actor)).map((r) => r.id));
  const unknown = data.roleIds.find((r) => !roleIds.has(r));
  if (unknown) throw invalid("One of those roles no longer exists.");
  if (data.userId) {
    const [m] = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, actor.workspaceId), eq(workspaceMembers.userId, data.userId)))
      .limit(1);
    if (!m) throw invalid("That account isn't in this workspace.");
    const [taken] = await db
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(and(eq(people.workspaceId, actor.workspaceId), eq(people.userId, data.userId)))
      .limit(1);
    if (taken && taken.id !== personId) throw invalid(`That account is already linked to ${taken.name}.`);
  }
}

export async function createPerson(db: Executor, actor: Actor, input: z.input<typeof PersonInput>) {
  requireEditor(actor);
  const data = PersonInput.parse(input);
  data.roleIds = [...new Set(data.roleIds)];
  await checkRefs(db, actor, data);
  const [row] = await db.insert(people).values({ workspaceId: actor.workspaceId, ...data }).returning();
  return toPerson(row);
}

async function loadPerson(db: Executor, actor: Actor, id: string) {
  const [p] = await db.select().from(people).where(and(eq(people.id, id), eq(people.workspaceId, actor.workspaceId))).limit(1);
  if (!p) throw notFound("That person isn't on the roster.");
  return p;
}

export async function updatePerson(db: Executor, actor: Actor, id: string, input: z.input<typeof PersonInput>) {
  requireEditor(actor);
  await loadPerson(db, actor, id);
  const data = PersonInput.parse(input);
  data.roleIds = [...new Set(data.roleIds)];
  await checkRefs(db, actor, data, id);
  const [row] = await db.update(people).set({ ...data, updatedAt: new Date() }).where(eq(people.id, id)).returning();
  return toPerson(row);
}

export async function deletePerson(db: Executor, actor: Actor, id: string) {
  requireEditor(actor);
  await loadPerson(db, actor, id);
  await db.delete(people).where(eq(people.id, id));
}

export const CheckInInput = z.object({
  status: z.enum(PERSON_STATUSES),
  note: z.string().trim().max(200).default(""),
  /** Editors can update someone else; everyone else checks in as themselves. */
  personId: z.string().max(64).optional(),
});

export async function checkIn(db: Executor, actor: Actor, input: z.input<typeof CheckInInput>) {
  requireMember(actor);
  const data = CheckInInput.parse(input);
  let person;
  if (data.personId) {
    person = await loadPerson(db, actor, data.personId);
    if (person.userId !== actor.userId && !atLeast(actor, "editor")) throw forbidden("You can only check yourself in.");
  } else {
    [person] = actor.userId ? await db.select().from(people).where(and(eq(people.workspaceId, actor.workspaceId), eq(people.userId, actor.userId))).limit(1) : [];
    if (!person) throw invalid("Your account isn't linked to the roster yet. Ask an editor to link it.");
  }
  const [row] = await db
    .update(people)
    .set({ status: data.status, statusNote: data.note, lastCheckIn: new Date(), updatedAt: new Date() })
    .where(eq(people.id, person.id))
    .returning();
  return toPerson(row);
}

export const RoleInput = z.object({
  name: z.string().trim().min(1, "Name the role").max(80),
  description: z.string().trim().max(500).default(""),
  color: Color.default("#a3a3a3"),
});

export async function createRole(db: Executor, actor: Actor, input: z.input<typeof RoleInput>) {
  requireEditor(actor);
  const data = RoleInput.parse(input);
  const [row] = await db.insert(teamRoles).values({ workspaceId: actor.workspaceId, ...data }).returning();
  return row;
}

async function loadRole(db: Executor, actor: Actor, id: string) {
  const [r] = await db.select().from(teamRoles).where(and(eq(teamRoles.id, id), eq(teamRoles.workspaceId, actor.workspaceId))).limit(1);
  if (!r) throw notFound("That role doesn't exist.");
  return r;
}

export async function updateRole(db: Executor, actor: Actor, id: string, input: z.input<typeof RoleInput>) {
  requireEditor(actor);
  await loadRole(db, actor, id);
  const data = RoleInput.parse(input);
  await db.update(teamRoles).set(data).where(eq(teamRoles.id, id));
}

/** Deleting a role takes it off everyone who had it. SOP steps assigned to it keep working but show no role. */
export async function deleteRole(db: Executor, actor: Actor, id: string) {
  requireEditor(actor);
  await loadRole(db, actor, id);
  await db
    .update(people)
    .set({ roleIds: sql`array_remove(${people.roleIds}, ${id})` })
    .where(and(eq(people.workspaceId, actor.workspaceId), sql`${id} = any(${people.roleIds})`));
  await db.delete(teamRoles).where(eq(teamRoles.id, id));
}
