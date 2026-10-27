import { and, desc, eq } from "drizzle-orm";
import type { Executor } from "@/db";
import { activity, users } from "@/db/schema";
import type { Actor } from "@/server/permissions";

/** "changed status from “To do” to “Done”, updated assignees": the history line for an edit. */
export function describeChanges(before: Record<string, unknown> | null, after: Record<string, unknown>, labels: Record<string, string>, show: (key: string, v: unknown) => string = (_k, v) => String(v)): string[] {
  const out: string[] = [];
  for (const [k, label] of Object.entries(labels)) {
    if (!(k in after)) continue;
    const a = before?.[k] ?? null;
    const b = after[k] ?? null;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (k === "description") out.push("edited the description");
    else if (Array.isArray(a) || Array.isArray(b)) out.push(`updated ${label}`);
    else if (b === null || b === "") out.push(`cleared ${label}`);
    else out.push(`changed ${label} ${a !== null && a !== "" ? `from “${show(k, a)}” ` : ""}to “${show(k, b)}”`);
  }
  return out;
}

export async function logActivity(db: Executor, actor: Actor, e: { projectId: string | null; targetType: string; targetId: string; targetName: string; text: string }) {
  if (!e.text) return;
  await db.insert(activity).values({ workspaceId: actor.workspaceId, actorId: actor.userId, ...e, text: e.text.slice(0, 1000), targetName: e.targetName.slice(0, 200) });
}

export type ActivityItem = { id: string; actorName: string | null; text: string; targetType: string; targetId: string; targetName: string; createdAt: string };

export async function listActivity(db: Executor, actor: Actor, where: { projectId?: string; targetType?: string; targetId?: string }, limit = 100): Promise<ActivityItem[]> {
  const rows = await db
    .select({ a: activity, actorName: users.name })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorId))
    .where(
      and(
        eq(activity.workspaceId, actor.workspaceId),
        where.projectId ? eq(activity.projectId, where.projectId) : undefined,
        where.targetType ? eq(activity.targetType, where.targetType) : undefined,
        where.targetId ? eq(activity.targetId, where.targetId) : undefined,
      ),
    )
    .orderBy(desc(activity.createdAt))
    .limit(Math.min(limit, 500));
  return rows.map(({ a, actorName }) => ({ id: a.id, actorName, text: a.text, targetType: a.targetType, targetId: a.targetId, targetName: a.targetName, createdAt: a.createdAt.toISOString() }));
}
