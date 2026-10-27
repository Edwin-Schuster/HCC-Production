import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { today } from "@/lib/work";
import { requireRole } from "@/server/context";
import { AppError } from "@/server/errors";
import { loadProject } from "@/server/services/projects";
import { assignableMembers, getTask, listTasks } from "@/server/services/tasks";
import { calendarFeedUrl } from "@/server/services/calendar";
import { TasksView, type TaskViewMode } from "@/components/work/tasks-view";

export const metadata: Metadata = { title: "Tasks" };

const VIEWS = ["list", "board", "calendar", "timeline"] as const;

export default function TasksPage(props: PageProps<"/projects/[id]/tasks">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Content params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/projects/[id]/tasks">, "params" | "searchParams">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const actor = await requireRole("editor", `/projects/${id}/tasks`);
  const db = await getDb();
  const project = await loadProject(db, actor, id);
  const view = (VIEWS as readonly string[]).includes(String(sp.view)) ? (sp.view as TaskViewMode) : "list";
  const taskId = typeof sp.task === "string" ? sp.task : null;
  const [tasks, members, feed] = await Promise.all([listTasks(db, actor, id), assignableMembers(db, actor), calendarFeedUrl(db, actor)]);
  let open = null;
  if (taskId) {
    try {
      open = await getTask(db, actor, taskId);
      if (open.task.projectId !== id) open = null;
    } catch (e) {
      if (!(e instanceof AppError && e.status < 500)) throw e;
    }
  }
  return <TasksView projectId={id} projectName={project.name} tasks={tasks} members={members} view={view} open={open} today={today()} calendarFeed={feed} selfId={actor.userId!} />;
}
