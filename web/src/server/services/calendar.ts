import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { projects, tasks, workspaces } from "@/db/schema";
import { buildIcs, type CalendarEvent } from "@/lib/ics";
import { PRIORITY_LABEL, TASK_STATUS_LABEL, type Priority, type TaskStatus } from "@/lib/work";
import { forbidden } from "@/server/errors";
import { atLeast, type Actor } from "@/server/permissions";

/**
 * A calendar feed (tasks due, project dates) that phones and Google/Outlook calendars subscribe to.
 * Calendar apps can't sign in, so the URL carries a secret token; an admin can rotate it.
 */

async function settingsOf(db: Executor, workspaceId: string) {
  const [ws] = await db.select({ name: workspaces.name, settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return ws;
}

/** The feed path for editors, or null if an admin hasn't turned it on. */
export async function calendarFeedUrl(db: Executor, actor: Actor): Promise<string | null> {
  if (!atLeast(actor, "editor")) return null;
  const token = (await settingsOf(db, actor.workspaceId))?.settings?.calendarToken;
  return token ? `/calendar.ics?token=${token}` : null;
}

/** Turns the feed on, or gives it a new address (the old one stops working). */
export async function rotateCalendarToken(db: Executor, actor: Actor, enabled = true) {
  if (!atLeast(actor, "admin")) throw forbidden("Only admins can manage the calendar feed.");
  const token = enabled ? randomBytes(24).toString("base64url") : undefined;
  await db
    .update(workspaces)
    .set({ settings: sql`coalesce(${workspaces.settings}, '{}'::jsonb) - 'calendarToken' || ${JSON.stringify(token ? { calendarToken: token } : {})}::jsonb` })
    .where(eq(workspaces.id, actor.workspaceId));
  return token ?? null;
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The .ics body for a token, or null if it doesn't match any workspace. */
export async function calendarFeed(db: Executor, token: string, origin: string): Promise<string | null> {
  if (!token || token.length > 100) return null;
  const all = await db.select({ id: workspaces.id, name: workspaces.name, settings: workspaces.settings }).from(workspaces);
  const ws = all.find((w) => w.settings?.calendarToken && same(w.settings.calendarToken, token));
  if (!ws) return null;
  const base = (ws.settings?.appUrl || origin).replace(/\/$/, "");
  const events: CalendarEvent[] = [];
  const open = await db
    .select({ t: tasks, project: projects.name })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.workspaceId, ws.id), ne(tasks.status, "done"), sql`${tasks.due} is not null`));
  for (const { t, project } of open)
    events.push({
      uid: `task-${t.id}`,
      start: t.due!,
      end: t.due!,
      summary: `Due: ${t.title}`,
      description: `${project} · ${PRIORITY_LABEL[t.priority as Priority] ?? t.priority} · ${TASK_STATUS_LABEL[t.status as TaskStatus] ?? t.status}`,
      url: `${base}/projects/${t.projectId}/tasks?task=${t.id}`,
    });
  for (const p of await db.select().from(projects).where(and(eq(projects.workspaceId, ws.id), sql`${projects.start} is not null`)))
    events.push({ uid: `project-${p.id}`, start: p.start!, end: p.end ?? p.start!, summary: `Project: ${p.name}`, description: p.summary, url: `${base}/projects/${p.id}` });
  return buildIcs(ws.name, events);
}
