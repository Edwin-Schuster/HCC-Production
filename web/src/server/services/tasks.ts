import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, Executor } from "@/db";
import { projects, tasks, users, workComments, workspaceMembers, workspaces, type Attachment } from "@/db/schema";
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, type Priority, type TaskStatus } from "@/lib/work";
import { forbidden, invalid, notFound } from "@/server/errors";
import { atLeast, type Actor } from "@/server/permissions";
import { describeChanges, listActivity, logActivity } from "./activity";
import { resolveMentions } from "./comments";
import { membersWithRole, notify } from "./notifications";
import { Day, loadProject, requireEditor } from "./projects";
import { emit } from "./webhooks";
import { Attachments } from "./files";

/**
 * Tasks belong to a project, or to no project ("general tasks"); subtasks are tasks with a parent in the same
 * project (or also general). Editors only.
 */

export type TaskView = {
  id: string;
  projectId: string | null;
  parentId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignees: string[];
  labels: string[];
  start: string | null;
  due: string | null;
  position: number;
  attachments: Attachment[];
  completedAt: string | null;
  createdAt: string;
  createdByName: string | null;
  commentCount: number;
};

const asStatus = (s: string): TaskStatus => ((TASK_STATUSES as readonly string[]).includes(s) ? (s as TaskStatus) : "todo");
const asPriority = (s: string): Priority => ((PRIORITIES as readonly string[]).includes(s) ? (s as Priority) : "medium");

const Fields = {
  title: z.string().trim().min(1, "Give the task a title").max(300),
  description: z.string().max(20_000),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  assignees: z.array(z.string().max(64)).max(20),
  labels: z.array(z.string().trim().min(1).max(40)).max(20),
  start: Day.nullable(),
  due: Day.nullable(),
  attachments: Attachments,
  parentId: z.string().max(64).nullable(),
};

export const TaskInput = z.object({
  /** Null for a general task. */
  projectId: z.string().min(1).max(64).nullable().default(null),
  title: Fields.title,
  description: Fields.description.default(""),
  status: Fields.status.default("todo"),
  priority: Fields.priority.default("medium"),
  assignees: Fields.assignees.default([]),
  labels: Fields.labels.default([]),
  start: Fields.start.default(null),
  due: Fields.due.default(null),
  attachments: Fields.attachments.default([]),
  parentId: Fields.parentId.default(null),
});

export const TaskPatch = z.object(Fields).partial();

const toView = (t: typeof tasks.$inferSelect, extra: { createdByName: string | null; commentCount: number }): TaskView => ({
  id: t.id,
  projectId: t.projectId,
  parentId: t.parentId,
  title: t.title,
  description: t.description,
  status: asStatus(t.status),
  priority: asPriority(t.priority),
  assignees: t.assignees,
  labels: t.labels,
  start: t.start,
  due: t.due,
  position: t.position,
  attachments: t.attachments,
  completedAt: t.completedAt?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
  ...extra,
});

// Outer columns are spelled out: in a single-table select Drizzle leaves them unqualified, and inside the
// subquery an unqualified "id" would mean the subquery's own table.
const commentCount = sql<number>`(select count(*)::int from ${workComments} c where c.target_type = 'task' and c.target_id = "tasks"."id")`;
const creatorName = sql<string | null>`(select name from ${users} u where u.id = "tasks"."created_by")`;

/** Tasks in one project's scope, or the general tasks when projectId is null. */
const scope = (actor: Actor, projectId: string | null) => (projectId ? eq(tasks.projectId, projectId) : and(isNull(tasks.projectId), eq(tasks.workspaceId, actor.workspaceId)));

export async function listTasks(db: Executor, actor: Actor, projectId: string | null): Promise<TaskView[]> {
  if (projectId) await loadProject(db, actor, projectId);
  else requireEditor(actor, "tasks");
  const rows = await db
    .select({ t: tasks, createdByName: creatorName, commentCount })
    .from(tasks)
    .where(scope(actor, projectId))
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
  return rows.map(({ t, ...extra }) => toView(t, extra));
}

/** People who can be assigned tasks: the workspace's editors and admins. */
export async function assignableMembers(db: Executor, actor: Actor) {
  requireEditor(actor);
  return db
    .select({ id: users.id, name: users.name, username: users.username })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, actor.workspaceId), inArray(workspaceMembers.role, ["editor", "admin"]), eq(users.disabled, false)))
    .orderBy(asc(users.name));
}

async function loadTask(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "tasks");
  const [t] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.workspaceId, actor.workspaceId))).limit(1);
  if (!t) throw notFound("Task not found.");
  return t;
}

async function checkAssignees(db: Executor, actor: Actor, ids: string[]) {
  if (!ids.length) return [];
  const unique = [...new Set(ids)];
  const ok = new Set(await membersWithRole(db, actor.workspaceId, ["editor", "admin"]));
  if (unique.some((u) => !ok.has(u))) throw invalid("Tasks can only be assigned to editors and admins.");
  return unique;
}

const cleanLabels = (labels: string[]) => [...new Map(labels.map((l) => [l.toLowerCase(), l])).values()];

async function checkParent(db: Executor, projectId: string | null, parentId: string | null, selfId?: string) {
  if (!parentId) return;
  // Walk up from the new parent: it must be in this project and must not be the task itself or one of its subtasks.
  let cursor: string | null = parentId;
  for (let depth = 0; cursor; depth++) {
    if (cursor === selfId) throw invalid("A task can't be a subtask of itself.");
    if (depth > 20) throw invalid("Subtasks are nested too deeply.");
    const [p]: { projectId: string | null; parentId: string | null }[] = await db.select({ projectId: tasks.projectId, parentId: tasks.parentId }).from(tasks).where(eq(tasks.id, cursor)).limit(1);
    if (!p || p.projectId !== projectId) throw invalid("The parent task must be in the same project.");
    cursor = p.parentId;
  }
}

async function nextPosition(db: Executor, actor: Actor, projectId: string | null, status: string) {
  const [r] = await db
    .select({ max: sql<number | null>`max(${tasks.position})` })
    .from(tasks)
    .where(and(scope(actor, projectId), eq(tasks.status, status)));
  return (r?.max ?? 0) + 1;
}

export const taskLink = (t: { projectId: string | null; id: string }) => (t.projectId ? `/projects/${t.projectId}/tasks?task=${t.id}` : `/tasks?task=${t.id}`);
const link = taskLink;

async function notifyAssigned(db: Executor, actor: Actor, t: typeof tasks.$inferSelect, userIds: string[]) {
  await notify(db, {
    workspaceId: actor.workspaceId,
    userIds,
    actorId: actor.userId,
    kind: "task_assigned",
    title: `${actor.name} assigned you “${t.title}”`,
    body: t.due ? `Due ${t.due}` : "",
    link: link(t),
  });
}

export async function createTask(db: Executor, actor: Actor, input: z.input<typeof TaskInput>) {
  requireEditor(actor, "tasks");
  const data = TaskInput.parse(input);
  const project = data.projectId ? await loadProject(db, actor, data.projectId) : null;
  await checkParent(db, project?.id ?? null, data.parentId);
  const assignees = await checkAssignees(db, actor, data.assignees);
  if (data.start && data.due && data.due < data.start) throw invalid("The due date is before the start date.");
  const [row] = await db
    .insert(tasks)
    .values({
      workspaceId: actor.workspaceId,
      ...data,
      assignees,
      labels: cleanLabels(data.labels),
      position: await nextPosition(db, actor, project?.id ?? null, data.status),
      completedAt: data.status === "done" ? new Date() : null,
      createdBy: actor.userId,
    })
    .returning();
  await logActivity(db, actor, { projectId: project?.id ?? null, targetType: "task", targetId: row.id, targetName: row.title, text: data.parentId ? "added this subtask" : "created this task" });
  await notifyAssigned(db, actor, row, assignees);
  await emit(db, actor.workspaceId, "task.created", { id: row.id, projectId: project?.id ?? null, project: project?.name ?? null, title: row.title, status: row.status, due: row.due });
  return toView(row, { createdByName: actor.name, commentCount: 0 });
}

const LABELS = { title: "title", status: "status", priority: "priority", start: "start date", due: "due date", assignees: "assignees", labels: "labels", description: "description" };

export async function updateTask(db: Executor, actor: Actor, id: string, patch: z.input<typeof TaskPatch>) {
  const before = await loadTask(db, actor, id);
  const data = TaskPatch.parse(patch);
  if (data.parentId !== undefined) await checkParent(db, before.projectId, data.parentId, id);
  if (data.assignees) data.assignees = await checkAssignees(db, actor, data.assignees);
  if (data.labels) data.labels = cleanLabels(data.labels);
  const start = data.start === undefined ? before.start : data.start;
  const due = data.due === undefined ? before.due : data.due;
  if (start && due && due < start) throw invalid("The due date is before the start date.");

  const set: Partial<typeof tasks.$inferInsert> = { ...data, updatedAt: new Date() };
  if (data.status && data.status !== before.status) {
    set.completedAt = data.status === "done" ? new Date() : null;
    set.position = await nextPosition(db, actor, before.projectId, data.status);
  }
  // A new due date earns a fresh reminder.
  if (data.due !== undefined && data.due !== before.due) Object.assign(set, { reminderSentAt: null, overdueNotifiedAt: null });
  const [row] = await db.update(tasks).set(set).where(eq(tasks.id, id)).returning();

  const names = new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...before.assignees, ...row.assignees, ""]))).map((u) => [u.id, u.name]));
  const changes = describeChanges(before, data, LABELS, (k, v) => (k === "status" ? TASK_STATUS_LABEL[asStatus(String(v))] : k === "priority" ? PRIORITY_LABEL[asPriority(String(v))] : String(v)));
  if (data.parentId !== undefined && data.parentId !== before.parentId) changes.push(data.parentId ? "made this a subtask" : "made this a top-level task");
  if (data.attachments && data.attachments.length > before.attachments.length) changes.push("added an attachment");
  else if (data.attachments && data.attachments.length < before.attachments.length) changes.push("removed an attachment");
  if (data.assignees) {
    const added = data.assignees.filter((u) => !before.assignees.includes(u));
    const idx = changes.indexOf("updated assignees");
    if (idx >= 0) {
      const removed = before.assignees.filter((u) => !data.assignees!.includes(u));
      changes[idx] = [added.length ? `assigned ${added.map((u) => names.get(u) ?? "someone").join(", ")}` : "", removed.length ? `unassigned ${removed.map((u) => names.get(u) ?? "someone").join(", ")}` : ""].filter(Boolean).join(" and ");
    }
    await notifyAssigned(db, actor, row, added);
  }
  await logActivity(db, actor, { projectId: row.projectId, targetType: "task", targetId: id, targetName: row.title, text: changes.join(", ") });
  if (set.completedAt && before.status !== "done") {
    const [p] = row.projectId ? await db.select({ name: projects.name }).from(projects).where(eq(projects.id, row.projectId)) : [];
    await emit(db, actor.workspaceId, "task.completed", { id, projectId: row.projectId, project: p?.name, title: row.title });
  }
  return row;
}

/** Drag and drop: put a task into a status column at an index (among that column's top-level tasks). */
export async function moveTask(db: Executor, actor: Actor, id: string, input: { status: TaskStatus; index: number }) {
  const data = z.object({ status: z.enum(TASK_STATUSES), index: z.number().int().min(0).max(10_000) }).parse(input);
  const t = await loadTask(db, actor, id);
  if (data.status !== t.status) await updateTask(db, actor, id, { status: data.status });
  const column = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(scope(actor, t.projectId), eq(tasks.status, data.status), isNull(tasks.parentId), ne(tasks.id, id)))
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
  const order = column.map((c) => c.id);
  order.splice(Math.min(data.index, order.length), 0, id);
  for (const [i, taskId] of order.entries()) await db.update(tasks).set({ position: i + 1 }).where(eq(tasks.id, taskId));
}

export async function deleteTask(db: Executor, actor: Actor, id: string) {
  const t = await loadTask(db, actor, id);
  await db.delete(tasks).where(eq(tasks.id, id));
  await db.delete(workComments).where(and(eq(workComments.targetType, "task"), eq(workComments.targetId, id)));
  await logActivity(db, actor, t.projectId ? { projectId: t.projectId, targetType: "project", targetId: t.projectId, targetName: t.title, text: `deleted the task “${t.title}”` } : { projectId: null, targetType: "task", targetId: t.id, targetName: t.title, text: "deleted this task" });
}

export type WorkComment = { id: string; authorId: string | null; authorName: string | null; body: string; createdAt: string };

export async function listWorkComments(db: Executor, actor: Actor, targetType: string, targetId: string): Promise<WorkComment[]> {
  requireEditor(actor, "comments");
  const rows = await db
    .select({ c: workComments, authorName: users.name })
    .from(workComments)
    .leftJoin(users, eq(users.id, workComments.authorId))
    .where(and(eq(workComments.workspaceId, actor.workspaceId), eq(workComments.targetType, targetType), eq(workComments.targetId, targetId)))
    .orderBy(asc(workComments.createdAt));
  return rows.map(({ c, authorName }) => ({ id: c.id, authorId: c.authorId, authorName, body: c.body, createdAt: c.createdAt.toISOString() }));
}

/** The task drawer: the task, its subtasks, comments and history. */
export async function getTask(db: Executor, actor: Actor, id: string) {
  const t = await loadTask(db, actor, id);
  const [[view], subtasks, comments, history, [project]] = await Promise.all([
    db.select({ t: tasks, createdByName: creatorName, commentCount }).from(tasks).where(eq(tasks.id, id)),
    db.select({ t: tasks, createdByName: creatorName, commentCount }).from(tasks).where(eq(tasks.parentId, id)).orderBy(asc(tasks.position), asc(tasks.createdAt)),
    listWorkComments(db, actor, "task", id),
    listActivity(db, actor, { targetType: "task", targetId: id }),
    t.projectId ? db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, t.projectId)) : Promise.resolve([]),
  ]);
  const [parent] = t.parentId ? await db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(eq(tasks.id, t.parentId)) : [];
  return {
    task: toView(view.t, view),
    subtasks: subtasks.map(({ t: s, ...extra }) => toView(s, extra)),
    comments,
    history,
    project: project ?? null,
    parent: parent ?? null,
  };
}

export const WorkCommentInput = z.object({ body: z.string().trim().min(1, "Write something first").max(5_000) });

export async function commentOnTask(db: Executor, actor: Actor, taskId: string, input: z.input<typeof WorkCommentInput>) {
  const t = await loadTask(db, actor, taskId);
  const { body } = WorkCommentInput.parse(input);
  const mentions = await resolveMentions(db, actor.workspaceId, body);
  const [row] = await db.insert(workComments).values({ workspaceId: actor.workspaceId, targetType: "task", targetId: t.id, projectId: t.projectId, authorId: actor.userId, body, mentions }).returning();
  await notify(db, { workspaceId: actor.workspaceId, userIds: mentions, actorId: actor.userId, kind: "mention", title: `${actor.name} mentioned you on “${t.title}”`, body, link: link(t) });
  await notify(db, { workspaceId: actor.workspaceId, userIds: t.assignees.filter((u) => !mentions.includes(u)), actorId: actor.userId, kind: "task_comment", title: `${actor.name} commented on “${t.title}”`, body, link: link(t) });
  await logActivity(db, actor, { projectId: t.projectId, targetType: "task", targetId: t.id, targetName: t.title, text: "commented" });
  return row;
}

export async function deleteWorkComment(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "comments");
  const [c] = await db.select().from(workComments).where(and(eq(workComments.id, id), eq(workComments.workspaceId, actor.workspaceId))).limit(1);
  if (!c) throw notFound("Comment not found.");
  if (c.authorId !== actor.userId && !atLeast(actor, "admin")) throw forbidden("You can only delete your own comments.");
  await db.delete(workComments).where(eq(workComments.id, id));
}

/** Open tasks assigned to the actor, soonest due first. */
export async function myTasks(db: Executor, actor: Actor, limit = 50) {
  if (!actor.userId || !atLeast(actor, "editor")) return [];
  const rows = await db
    .select({ t: tasks, project: projects.name, color: projects.color })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.workspaceId, actor.workspaceId), ne(tasks.status, "done"), sql`${actor.userId} = any(${tasks.assignees})`))
    .orderBy(sql`${tasks.due} asc nulls last`, desc(tasks.priority))
    .limit(limit);
  return rows.map(({ t, project, color }) => ({ id: t.id, projectId: t.projectId, project: project ?? "General", color: color ?? "#a3a3a3", title: t.title, due: t.due, status: asStatus(t.status), priority: asPriority(t.priority) }));
}

/** The UTC instant of a wall-clock time on a day in a time zone ("5 pm on the due date, local time"). */
export function zonedInstant(day: string, hour: number, timeZone?: string): Date {
  const guess = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
  if (!timeZone) return new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess).map((p) => [p.type, p.value]));
  const asLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

/**
 * Reminds assignees once when a task is due within the workspace's reminder window (default 24 hours before
 * 5 pm on the due date), and once more when it's overdue. Safe to run repeatedly.
 */
export async function sweepTaskReminders(db: DB, now = new Date()) {
  const tz = process.env.NEXT_PUBLIC_APP_TIMEZONE || undefined;
  let sent = 0;
  for (const ws of await db.select({ id: workspaces.id, settings: workspaces.settings }).from(workspaces)) {
    const hours = ws.settings?.reminderHours ?? 24;
    const open = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, ws.id), ne(tasks.status, "done"), sql`${tasks.due} is not null`, sql`cardinality(${tasks.assignees}) > 0`, sql`(${tasks.reminderSentAt} is null or ${tasks.overdueNotifiedAt} is null)`));
    for (const t of open) {
      const dueAt = zonedInstant(t.due!, 17, tz);
      const hrs = (dueAt.getTime() - now.getTime()) / 36e5;
      const kind = hrs < 0 && !t.overdueNotifiedAt ? "task_overdue" : hrs >= 0 && hrs <= hours && !t.reminderSentAt ? "task_due" : null;
      if (!kind) continue;
      sent += await notify(db, {
        workspaceId: ws.id,
        userIds: t.assignees,
        actorId: null,
        kind,
        title: kind === "task_overdue" ? `Overdue: ${t.title}` : `Due soon: ${t.title}`,
        body: `${kind === "task_overdue" ? "Was due" : "Due"} ${t.due}`,
        link: link(t),
        dedupeKey: `${kind}:${t.id}:${t.due}`,
      });
      await db
        .update(tasks)
        .set(kind === "task_overdue" ? { overdueNotifiedAt: now, reminderSentAt: t.reminderSentAt ?? now } : { reminderSentAt: now })
        .where(eq(tasks.id, t.id));
    }
  }
  return sent;
}
