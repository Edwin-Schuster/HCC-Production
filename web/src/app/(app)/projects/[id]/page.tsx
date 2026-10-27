import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/server/context";
import { AppError } from "@/server/errors";
import { listActivity } from "@/server/services/activity";
import { getProject } from "@/server/services/projects";
import { assignableMembers, listTasks } from "@/server/services/tasks";
import { listCables } from "@/server/services/cabling";
import { projectBudget } from "@/server/services/purchasing";
import { listPunch } from "@/server/services/contractors";
import { CABLE_VERIFIED } from "@/lib/cabling";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Avatar, PriorityBadge } from "@/components/work/badges";
import { ActivityList, Stat } from "@/components/work/overview";
import { formatDay, formatMoney } from "@/lib/format";
import { PRIORITY_RANK, isOverdue, today } from "@/lib/work";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Project" };

export default function ProjectPage(props: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Overview params={props.params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<"/projects/[id]">["params"] }) {
  const { id } = await params;
  const { db, actor } = await getContext();
  if (!actor.userId) return null;
  let project;
  try {
    project = await getProject(db, actor, id);
  } catch (e) {
    if (e instanceof AppError && e.status < 500) return null; // the layout explains
    throw e;
  }
  if (!("progress" in project))
    return (
      <div className="max-w-xl rounded-[12px] border border-line bg-surface p-5">
        {project.summary && <p className="text-[14px] text-fg-2">{project.summary}</p>}
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
          <dt className="text-muted">Start</dt>
          <dd>{formatDay(project.start)}</dd>
          <dt className="text-muted">Finish</dt>
          <dd>{formatDay(project.end)}</dd>
        </dl>
        <p className="mt-4 text-xs text-faint">Tasks, budgets and contractor details are visible to production editors only.</p>
      </div>
    );

  const [tasks, members, history, cables, budget, punch] = await Promise.all([listTasks(db, actor, id), assignableMembers(db, actor), listActivity(db, actor, { projectId: id }, 8), listCables(db, actor, id), projectBudget(db, actor, id), listPunch(db, actor, { projectId: id, open: true })]);
  const tested = cables.filter((c) => CABLE_VERIFIED.includes(c.status)).length;
  const t = today();
  const { total, done, overdue } = project.progress;
  const upcoming = tasks
    .filter((x) => x.due && x.status !== "done")
    .sort((a, b) => a.due!.localeCompare(b.due!) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, 6);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const team = [...new Set(tasks.flatMap((x) => x.assignees))].filter((u) => names.has(u));

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tasks done" value={`${total ? Math.round((done / total) * 100) : 0}%`} sub={<>{done} of {total}{overdue > 0 && <span className="text-bad"> · {overdue} overdue</span>}</>} pct={total ? (done / total) * 100 : 0} />
        <Stat
          label="Budget committed"
          value={formatMoney(budget.committed)}
          sub={`of ${formatMoney(budget.budget)} · ${formatMoney(budget.remaining)} left`}
          pct={budget.budget ? (budget.committed / budget.budget) * 100 : 0}
          tone={budget.remaining < 0 ? "bad" : undefined}
        />
        <Stat label="Open punch items" value={punch.length} sub={punch.length ? `${punch.filter((x) => x.due && x.due < t).length} past due` : "Nothing outstanding"} />
        <Stat label="Cables tested" value={`${tested}/${cables.length}`} sub="Tested, labeled or complete" pct={cables.length ? (tested / cables.length) * 100 : 0} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[12px] border border-line bg-surface p-5">
          <h2 className="text-[15px] font-[510]">About this project</h2>
          {project.summary && <p className="mt-2 text-[13.5px] text-fg-2">{project.summary}</p>}
          {project.description ? <Markdown source={project.description} className="mt-3" /> : !project.summary && <p className="mt-2 text-[13px] text-muted">No description yet.</p>}
          {team.length > 0 && (
            <>
              <h3 className="mt-5 text-xs font-[510] text-muted">People on tasks</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {team.map((u) => (
                  <span key={u} className="flex items-center gap-1.5 rounded-full bg-wash py-0.5 pl-0.5 pr-2 text-xs text-fg-2">
                    <Avatar name={names.get(u)!} size="xs" /> {names.get(u)}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
        <section className="rounded-[12px] border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-[510]">Coming up</h2>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/projects/${id}/tasks`}>All tasks</Link>
            </Button>
          </div>
          {upcoming.length ? (
            <ul className="mt-2 grid" role="list">
              {upcoming.map((x) => (
                <li key={x.id}>
                  <Link href={`/projects/${id}/tasks?task=${x.id}`} className="-mx-2 flex items-center gap-3 rounded-[6px] px-2 py-1.5 hover:bg-wash-2">
                    <span className={cn("w-14 shrink-0 font-mono text-xs", isOverdue(x, t) ? "text-bad" : "text-muted")}>{formatDay(x.due, { month: "short", day: "numeric" })}</span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg-hi">{x.title}</span>
                    <PriorityBadge priority={x.priority} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-muted">Nothing due.</p>
          )}
          <h2 className="mt-6 text-[15px] font-[510]">Recent activity</h2>
          <ActivityList items={history} />
        </section>
      </div>
    </div>
  );
}
