import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { people, sessions, users, workspaceMembers, workspaces } from "@/db/schema";
import { hashPassword } from "@/server/auth/password";
import { forbidden, invalid } from "@/server/errors";
import { canManageMembers, type Actor, type Role } from "@/server/permissions";

export const DEFAULT_WORKSPACE_SLUG = "hcc";

export async function getDefaultWorkspace(db: Executor) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, DEFAULT_WORKSPACE_SLUG)).limit(1);
  return ws ?? null;
}

export async function roleIn(db: Executor, workspaceId: string, userId: string): Promise<Exclude<Role, "public"> | null> {
  const [m] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return m?.role ?? null;
}

export type MemberView = { id: string; username: string; name: string; email: string | null; role: Exclude<Role, "public">; hasPassword: boolean };

export async function listMembers(db: Executor, actor: Actor): Promise<MemberView[]> {
  if (!actor.userId) return [];
  const rows = await db
    .select({ id: users.id, username: users.username, name: users.name, email: users.email, role: workspaceMembers.role, passwordHash: users.passwordHash })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, actor.workspaceId), eq(users.disabled, false)))
    .orderBy(asc(users.name));
  return rows.map(({ passwordHash, ...r }) => ({ ...r, email: canManageMembers(actor) ? r.email : null, hasPassword: Boolean(passwordHash) }));
}

export const MemberInput = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{2,40}$/, "Usernames use 2–40 lowercase letters, digits, dots, dashes or underscores"),
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().email().max(200).or(z.literal("")).optional(),
  role: z.enum(["admin", "editor", "viewer"]),
  password: z.string().min(8, "Passwords need at least 8 characters").max(200).optional(),
});

export async function upsertMember(db: Executor, actor: Actor, input: z.input<typeof MemberInput>, userId?: string) {
  if (!canManageMembers(actor)) throw forbidden("Only admins can manage people.");
  const data = MemberInput.parse(input);
  return db.transaction(async (tx) => {
    const [clash] = await tx.select({ id: users.id }).from(users).where(eq(users.username, data.username)).limit(1);
    if (clash && clash.id !== userId) throw invalid("That username is taken.");
    let id = userId;
    if (id) {
      if (id === actor.userId && data.role !== "admin") throw invalid("You can't remove your own admin role.");
      await tx.update(users).set({ username: data.username, name: data.name, email: data.email || null }).where(eq(users.id, id));
    } else {
      [{ id }] = await tx.insert(users).values({ username: data.username, name: data.name, email: data.email || null }).returning({ id: users.id });
    }
    if (data.password) {
      await tx.update(users).set({ passwordHash: hashPassword(data.password) }).where(eq(users.id, id!));
      await tx.delete(sessions).where(eq(sessions.userId, id!));
    }
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: actor.workspaceId, userId: id!, role: data.role })
      .onConflictDoUpdate({ target: [workspaceMembers.workspaceId, workspaceMembers.userId], set: { role: data.role } });
    return id!;
  });
}

export const ProfileInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().email("That email doesn't look right").max(200).or(z.literal("")).optional(),
});

/** Anyone signed in can change their own display name and email; their roster entry follows. */
export async function updateOwnProfile(db: Executor, actor: Actor, input: z.input<typeof ProfileInput>) {
  if (!actor.userId) throw forbidden("Sign in to change your profile.");
  const data = ProfileInput.parse(input);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ name: data.name, email: data.email || null }).where(eq(users.id, actor.userId!));
    await tx.update(people).set({ name: data.name }).where(and(eq(people.workspaceId, actor.workspaceId), eq(people.userId, actor.userId!)));
  });
}
