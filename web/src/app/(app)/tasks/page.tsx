import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { AppError } from "@/server/errors";
import { calendarFeedUrl } from "@/server/services/calendar";
import { assignableMembers, getTask, listTasks, myTasks, taskLink } from "@/server/services/tasks";
import { Page, PageHeader } from "@/components/page";
import { PriorityBadge } from "@/components/work/badges";
import { TasksView, type TaskViewMode } from "@/components/work/tasks-view";
import { formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isOverdue, today } from "@/lib/work";

export const metadata: Metadata = { title: "Tasks" };

const VIEWS = ["list", "board", "calendar", "timeline"] as const;

/** General tasks (not part of any project), plus everything assigned to you across projects. */
export default function TasksPage(props: PageProps<"/tasks">) {
  return (
    <Page wide>
      <PageHeader title="Tasks" subtitle="General tasks that aren't part of a project, and everything assigned to you." />
      <Suspense fallback={<div className="h-96" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/tasks">["searchParams"] }) {
  const sp = await searchParams;
  const actor = await requireRole("editor", "/tasks");
  const db = await getDb();
  const view = (VIEWS as readonly string[]).includes(String(sp.view)) ? (sp.view as TaskViewMode) : "list";
  const taskId = typeof sp.task === "string" ? sp.task : null;
  const [tasks, members, feed, mine] = await Promise.all([listTasks(db, actor, null), assignableMembers(db, actor), calendarFeedUrl(db, actor), myTasks(db, actor)]);
  let open = null;
  if (taskId) {
    try {
      open = await getTask(db, actor, taskId);
      if (open.task.projectId !== null) open = null;
    } catch (e) {
      if (!(e instanceof AppError && e.status < 500)) throw e;
    }
  }
  const t = today();
  const elsewhere = mine.filter((x) => x.projectId !== null);
  return (
    <div className="grid grid-cols-1 gap-8">
      {elsewhere.length > 0 && (
        <section aria-labelledby="mine-h" className="rounded-[12px] border border-line bg-surface p-4">
          <h2 id="mine-h" className="mb-2 text-[15px] font-[510]">
            Assigned to you in projects
          </h2>
          <ul className="grid grid-cols-1">
            {elsewhere.map((x) => (
              <li key={x.id}>
                <Link href={taskLink(x)} className="-mx-2 flex items-center gap-3 rounded-[6px] px-2 py-1.5 hover:bg-wash-2">
                  <span className={cn("w-12 shrink-0 font-mono text-xs", isOverdue(x, t) ? "text-bad" : "text-muted")}>{x.due ? formatDay(x.due, { month: "short", day: "numeric" }) : "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg-hi">
                    {x.title}
                    <span className="text-xs text-muted"> · {x.project}</span>
                  </span>
                  <PriorityBadge priority={x.priority} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="general-h">
        <h2 id="general-h" className="mb-3 text-[15px] font-[510]">
          General tasks
        </h2>
        <TasksView projectId={null} projectName="General tasks" tasks={tasks} members={members} view={view} open={open} today={t} calendarFeed={feed} selfId={actor.userId!} />
      </section>
    </div>
  );
}
