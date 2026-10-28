import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { notifications, users, workspaceMembers } from "@/db/schema";
import type { Actor, Role } from "@/server/permissions";
import { sendPush } from "./push";

export type NotificationKind =
  | "review_due"
  | "review_overdue"
  | "review_requested"
  | "approved"
  | "changes_requested"
  | "feedback"
  | "feedback_resolved"
  | "comment"
  | "mention"
  | "suggestion"
  | "suggestion_resolved"
  | "published"
  | "training_assigned"
  | "training_completed"
  | "task_assigned"
  | "task_due"
  | "task_overdue"
  | "task_comment";

/**
 * In-app notifications. The person who caused an event is never notified about it.
 * dedupeKey makes repeats (like a daily reminder sweep) a no-op.
 */
export async function notify(
  db: Executor,
  n: { workspaceId: string; userIds: (string | null | undefined)[]; actorId: string | null; kind: NotificationKind; title: string; body?: string; link: string; dedupeKey?: string },
) {
  const recipients = [...new Set(n.userIds.filter((u): u is string => Boolean(u) && u !== n.actorId))];
  if (!recipients.length) return 0;
  const rows = await db
    .insert(notifications)
    .values(recipients.map((userId) => ({ workspaceId: n.workspaceId, userId, actorId: n.actorId, kind: n.kind, title: n.title.slice(0, 300), body: (n.body ?? "").slice(0, 1000), link: n.link, dedupeKey: n.dedupeKey ?? null })))
    .onConflictDoNothing()
    .returning({ userId: notifications.userId });
  // Phones hear about it too (fire and forget: never slows down the action).
  if (rows.length) void sendPush(db, n.workspaceId, rows.map((r) => r.userId), { title: n.title, body: n.body, link: n.link });
  return rows.length;
}

/** Members at or above a role, for "notify every editor" style fan-out. */
export async function membersWithRole(db: Executor, workspaceId: string, roles: Exclude<Role, "public">[]) {
  const rows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.role, roles), eq(users.disabled, false)));
  return rows.map((r) => r.userId);
}

export type NotificationItem = { id: string; kind: string; title: string; body: string; link: string; actorName: string | null; createdAt: string; read: boolean };

export async function listNotifications(db: Executor, actor: Actor, opts: { limit?: number; unreadOnly?: boolean } = {}): Promise<NotificationItem[]> {
  if (!actor.userId) return [];
  const actorUser = sql<string | null>`(select name from ${users} where ${users.id} = ${notifications.actorId})`;
  const rows = await db
    .select({ n: notifications, actorName: actorUser })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.userId), eq(notifications.workspaceId, actor.workspaceId), opts.unreadOnly ? isNull(notifications.readAt) : undefined))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200));
  return rows.map(({ n, actorName }) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, actorName, createdAt: n.createdAt.toISOString(), read: n.readAt !== null }));
}

export async function unreadCount(db: Executor, actor: Actor): Promise<number> {
  if (!actor.userId) return 0;
  const [r] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.userId), eq(notifications.workspaceId, actor.workspaceId), isNull(notifications.readAt)));
  return Number(r?.n ?? 0);
}

/** Marks the given notifications (or all of them) read. Only ever touches the actor's own. */
export async function markRead(db: Executor, actor: Actor, ids: string[] | "all") {
  if (!actor.userId) return;
  const own = and(eq(notifications.userId, actor.userId), isNull(notifications.readAt));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(ids === "all" ? own : and(own, inArray(notifications.id, ids.slice(0, 500))));
}
