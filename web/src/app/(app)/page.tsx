import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { getContext } from "@/server/context";
import { atLeast } from "@/server/permissions";
import { listActivity } from "@/server/services/activity";
import { insuranceWarnings } from "@/server/services/contractors";
import { unreadCount } from "@/server/services/notifications";
import { listProjects, type Project } from "@/server/services/projects";
import { listRoster } from "@/server/services/roster";
import { listSops } from "@/server/services/sops";
import { myTasks, taskLink } from "@/server/services/tasks";
import { Page, PageHeader } from "@/components/page";
import { Ago } from "@/components/local-date";
import { Greeting } from "@/components/work/home";
import { Meter, PriorityBadge, ProjectStatusBadge } from "@/components/work/badges";
import { ActivityList } from "@/components/work/overview";
import { formatDay } from "@/lib/format";
import { addDays, isOverdue, today } from "@/lib/work";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

export default function Home() {
  return (
    <Page wide>
      <Suspense fallback={<div className="h-96" />}>
        <Dashboard />
      </Suspense>
    </Page>
  );
}

function Card({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[12px] border border-line bg-surface p-4", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-[510]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

async function Dashboard() {
  const { db, actor } = await getContext();
  if (!actor.userId) redirect("/sops");
  const editor = atLeast(actor, "editor");
  const t = today();
  const [roster, unread, sops, projects, mine, warnings, activity] = await Promise.all([
    listRoster(db, actor),
    unreadCount(db, actor),
    listSops(db, actor),
    listProjects(db, actor),
    myTasks(db, actor),
    editor ? insuranceWarnings(db, actor) : Promise.resolve([]),
    editor ? listActivity(db, actor, {}, 8) : Promise.resolve([]),
  ]);
  const recent = [...sops].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const active = projects.filter((p) => p.status === "active" || p.status === "planning");
  const overdue = mine.filter((x) => isOverdue(x, t));
  const week = mine.filter((x) => x.due && !isOverdue(x, t) && x.due <= addDays(t, 7));
  const later = mine.filter((x) => !overdue.includes(x) && !week.includes(x));
  const people = roster.people.slice(0, 8);
  const roleName = new Map(roster.roles.map((r) => [r.id, r.name]));

  const taskRow = (x: (typeof mine)[number]) => (
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
  );

  return (
    <>
      <PageHeader
        title={<Greeting name={actor.name} />}
        subtitle={
          editor ? (
            <>
              {mine.length} open task{mine.length === 1 ? "" : "s"} assigned to you{overdue.length > 0 && <span className="text-bad"> · {overdue.length} overdue</span>}
              {unread > 0 && (
                <>
                  {" · "}
                  <Link href="/inbox" className="underline decoration-line-2 underline-offset-2">
                    {unread} unread
                  </Link>
                </>
              )}
            </>
          ) : unread ? (
            <Link href="/inbox">{unread} unread notification{unread === 1 ? "" : "s"}</Link>
          ) : (
            "Here's what the production team is up to."
          )
        }
      />
      <div className="grid grid-cols-1 gap-4">
        {warnings.length > 0 && (
          <p role="alert" className="flex items-start gap-2 rounded-[8px] border border-warn/40 bg-warn-soft px-3 py-2 text-[13px] text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Contractor insurance {warnings.some((w) => w.insurance === "expired") ? "expired or expiring" : "expiring soon"}:{" "}
              {warnings.map((w, i) => (
                <span key={w.id}>
                  {i > 0 && ", "}
                  <Link href={`/contractors/${w.id}`} className="underline underline-offset-2">
                    {w.company}
                  </Link>{" "}
                  ({formatDay(w.insuranceExpires)})
                </span>
              ))}
            </span>
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {editor && (
            <Card title="My tasks">
              {mine.length ? (
                <div className="grid grid-cols-1 gap-3">
                  {overdue.length > 0 && (
                    <div>
                      <h3 className="text-xs font-[510] text-bad">Overdue</h3>
                      <ul className="mt-1 grid grid-cols-1">{overdue.map(taskRow)}</ul>
                    </div>
                  )}
                  {week.length > 0 && (
                    <div>
                      <h3 className="text-xs font-[510] text-muted">Due this week</h3>
                      <ul className="mt-1 grid grid-cols-1">{week.map(taskRow)}</ul>
                    </div>
                  )}
                  {later.length > 0 && (
                    <div>
                      <h3 className="text-xs font-[510] text-muted">Later</h3>
                      <ul className="mt-1 grid grid-cols-1">{later.slice(0, 6).map(taskRow)}</ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-muted">Nothing assigned to you right now.</p>
              )}
            </Card>
          )}
          <Card
            title="Team"
            action={
              <Link href="/roster" className="text-xs text-muted hover:text-fg-hi">
                Full roster
              </Link>
            }
          >
            <ul className="grid grid-cols-1 gap-1.5">
              {people.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-fg-hi">{p.name}</span>
                  <span className="truncate text-xs text-muted">{p.roleIds.map((id) => roleName.get(id)).filter(Boolean).join(", ")}</span>
                </li>
              ))}
              {!people.length && <li className="text-[13px] text-muted">No one on the roster yet.</li>}
            </ul>
          </Card>
        </div>
        {active.length > 0 && (
          <Card title="Active projects">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((p) => {
                const full = "progress" in p ? (p as Project) : null;
                const pct = full?.progress.total ? (full.progress.done / full.progress.total) * 100 : 0;
                return (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="flex h-full flex-col gap-1.5 rounded-[8px] border border-line p-3 hover:bg-wash-2" style={{ borderTop: `2px solid ${p.color}` }}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[14px] font-[510] text-fg-hi">{p.name}</span>
                        <ProjectStatusBadge status={p.status} />
                      </span>
                      {full ? (
                        <>
                          <Meter pct={pct} />
                          <span className="text-xs text-muted">
                            {full.progress.done}/{full.progress.total} tasks{full.progress.overdue > 0 && <span className="text-bad"> · {full.progress.overdue} overdue</span>}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted">
                          {formatDay(p.start)} → {formatDay(p.end)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {editor && (
            <Card title="Recent activity">
              <ActivityList items={activity} />
            </Card>
          )}
          <Card
            title="Recently updated SOPs"
            action={
              <Link href="/sops" className="text-xs text-muted hover:text-fg-hi">
                All SOPs
              </Link>
            }
          >
            <ul className="grid grid-cols-1">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link href={`/sops/${s.id}`} className="-mx-2 flex items-center gap-3 rounded-[6px] px-2 py-1.5 hover:bg-wash-2">
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg-hi">{s.title}</span>
                    <Ago iso={s.updatedAt} className="text-xs text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
