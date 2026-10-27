import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { notifications, tasks } from "@/db/schema";
import { addDays, today } from "@/lib/work";
import { listActivity } from "@/server/services/activity";
import { createProject, getProject, listProjects, updateProject } from "@/server/services/projects";
import { commentOnTask, createTask, getTask, listTasks, moveTask, sweepTaskReminders, updateTask, zonedInstant } from "@/server/services/tasks";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

const kinds = async (userId: string) => (await t.db.select({ kind: notifications.kind, title: notifications.title }).from(notifications).where(eq(notifications.userId, userId))).map((n) => n.kind);

describe("projects", () => {
  it("shows members only the schedule, and editors everything", async () => {
    const editor = await t.actorFor("editor", "pj-ed");
    const viewer = await t.actorFor("viewer", "pj-vw");
    const p = await createProject(t.db, editor, { name: "Sanctuary AV", status: "active", budget: 1234.5, start: "2026-03-01", end: "2026-06-30", description: "Secret notes" });
    const seen = await getProject(t.db, viewer, p.id);
    expect(seen).not.toHaveProperty("budgetCents");
    expect(seen).not.toHaveProperty("description");
    expect(seen).toMatchObject({ name: "Sanctuary AV", status: "active", start: "2026-03-01" });
    expect(await getProject(t.db, editor, p.id)).toMatchObject({ budgetCents: 123450, description: "Secret notes", progress: { total: 0 } });
    await expect(createProject(t.db, viewer, { name: "Nope" })).rejects.toThrow(/Only editors/);
    await expect(listProjects(t.db, t.publicActor)).rejects.toThrow(/Sign in/);
    await expect(createProject(t.db, editor, { name: "Bad dates", start: "2026-05-01", end: "2026-04-01" })).rejects.toThrow(/finish date is before/);
  });

  it("records what changed in the project's history", async () => {
    const editor = await t.actorFor("editor", "pj-hist");
    const p = await createProject(t.db, editor, { name: "Lobby screens" });
    await updateProject(t.db, editor, p.id, { name: "Lobby screens", status: "active", budget: 5000 });
    const [latest] = await listActivity(t.db, editor, { projectId: p.id });
    expect(latest.text).toBe("changed status from “Planning” to “Active”, changed budget from “$0” to “$5,000”");
  });
});

describe("tasks", () => {
  it("notifies new assignees and logs readable history", async () => {
    const editor = await t.actorFor("editor", "tk-ed");
    const other = await t.actorFor("editor", "tk-other");
    const viewer = await t.actorFor("viewer", "tk-vw");
    const p = await createProject(t.db, editor, { name: "Youth room" });
    await expect(createTask(t.db, editor, { projectId: p.id, title: "x", assignees: [viewer.userId!] })).rejects.toThrow(/editors and admins/);
    await expect(listTasks(t.db, viewer, p.id)).rejects.toThrow(/Only editors/);

    const task = await createTask(t.db, editor, { projectId: p.id, title: "Hang projector", assignees: [other.userId!], due: "2026-05-01", labels: ["Video", "video"] });
    expect(task.labels).toEqual(["video"]);
    expect(await kinds(other.userId!)).toContain("task_assigned");

    await updateTask(t.db, other, task.id, { status: "done", assignees: [editor.userId!] });
    const [h] = (await getTask(t.db, editor, task.id)).history;
    expect(h.text).toBe("changed status from “To do” to “Done”, assigned tk-ed and unassigned tk-other");
    const [row] = await t.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(row.completedAt).not.toBeNull();
    expect(await getProject(t.db, editor, p.id)).toMatchObject({ progress: { total: 1, done: 1 } });
  });

  it("keeps subtasks in the project and refuses cycles", async () => {
    const editor = await t.actorFor("editor", "tk-sub");
    const p = await createProject(t.db, editor, { name: "Subtasks" });
    const q = await createProject(t.db, editor, { name: "Elsewhere" });
    const parent = await createTask(t.db, editor, { projectId: p.id, title: "Parent" });
    const child = await createTask(t.db, editor, { projectId: p.id, title: "Child", parentId: parent.id });
    const foreign = await createTask(t.db, editor, { projectId: q.id, title: "Foreign" });
    await expect(updateTask(t.db, editor, parent.id, { parentId: child.id })).rejects.toThrow(/subtask of itself/);
    await expect(createTask(t.db, editor, { projectId: p.id, title: "Bad", parentId: foreign.id })).rejects.toThrow(/same project/);
    expect((await getTask(t.db, editor, parent.id)).subtasks.map((s) => s.title)).toEqual(["Child"]);
  });

  it("reorders a board column", async () => {
    const editor = await t.actorFor("editor", "tk-move");
    const p = await createProject(t.db, editor, { name: "Board" });
    const [a, b, c] = [await createTask(t.db, editor, { projectId: p.id, title: "A" }), await createTask(t.db, editor, { projectId: p.id, title: "B" }), await createTask(t.db, editor, { projectId: p.id, title: "C" })];
    await moveTask(t.db, editor, c.id, { status: "todo", index: 0 });
    await moveTask(t.db, editor, a.id, { status: "in_progress", index: 0 });
    const list = await listTasks(t.db, editor, p.id);
    expect(list.filter((x) => x.status === "todo").map((x) => x.title)).toEqual(["C", "B"]);
    expect(list.find((x) => x.id === a.id)?.status).toBe("in_progress");
    expect(b.id).toBeTruthy();
  });

  it("notifies mentioned people and assignees about comments", async () => {
    const editor = await t.actorFor("editor", "tk-cm");
    const assignee = await t.actorFor("editor", "tk-cm-as");
    const mentioned = await t.actorFor("editor", "tk-cm-mn");
    const p = await createProject(t.db, editor, { name: "Comments" });
    const task = await createTask(t.db, editor, { projectId: p.id, title: "Run cable", assignees: [assignee.userId!] });
    await commentOnTask(t.db, editor, task.id, { body: "Can @tk-cm-mn help? " });
    expect(await kinds(mentioned.userId!)).toEqual(["mention"]);
    expect(await kinds(assignee.userId!)).toContain("task_comment");
    expect((await getTask(t.db, editor, task.id)).comments[0]).toMatchObject({ authorName: "tk-cm", body: "Can @tk-cm-mn help?" });
    expect((await listTasks(t.db, editor, p.id))[0]).toMatchObject({ commentCount: 1, createdByName: "tk-cm" });
  });

  it("reminds once before the due date and once when overdue", async () => {
    const editor = await t.actorFor("editor", "tk-rem");
    const assignee = await t.actorFor("editor", "tk-rem-as");
    const p = await createProject(t.db, editor, { name: "Reminders" });
    const due = addDays(today(), 1);
    const task = await createTask(t.db, editor, { projectId: p.id, title: "Order cable", assignees: [assignee.userId!], due });
    const soon = new Date(zonedInstant(due, 17, process.env.NEXT_PUBLIC_APP_TIMEZONE).getTime() - 3 * 36e5);
    await sweepTaskReminders(t.db, soon);
    await sweepTaskReminders(t.db, soon);
    const after = new Date(soon.getTime() + 6 * 36e5);
    await sweepTaskReminders(t.db, after);
    await sweepTaskReminders(t.db, after);
    const mine = await t.db.select({ kind: notifications.kind }).from(notifications).where(and(eq(notifications.userId, assignee.userId!), eq(notifications.link, `/projects/${p.id}/tasks?task=${task.id}`)));
    expect(mine.map((n) => n.kind).sort()).toEqual(["task_assigned", "task_due", "task_overdue"]);
  });

  it("converts local wall-clock time to an instant", () => {
    expect(zonedInstant("2026-07-01", 17, "America/Chicago").toISOString()).toBe("2026-07-01T22:00:00.000Z");
    expect(zonedInstant("2026-01-15", 17, "America/Chicago").toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });
});
