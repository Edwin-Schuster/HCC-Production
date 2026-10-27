import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/db";
import { today } from "@/lib/work";
import { requireRole } from "@/server/context";
import { atLeast } from "@/server/permissions";
import { listProjects, type Project, type ProjectSummary } from "@/server/services/projects";
import { assignableMembers } from "@/server/services/tasks";
import { Empty, Page, PageHeader } from "@/components/page";
import { Gantt } from "@/components/work/gantt";
import { Meter, ProjectStatusBadge } from "@/components/work/badges";
import { ProjectFormButton } from "@/components/work/project-form";
import { formatDay, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <Page wide>
      <Suspense fallback={<div className="h-96" />}>
        <Content />
      </Suspense>
    </Page>
  );
}


async function Content() {
  const actor = await requireRole("viewer", "/projects");
  const db = await getDb();
  const editor = atLeast(actor, "editor");
  const [projects, members] = await Promise.all([listProjects(db, actor), editor ? assignableMembers(db, actor) : Promise.resolve([])]);
  const t = today();
  const dated = projects.filter((p) => p.start);
  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={editor ? "Installs, upgrades and building work." : "What the production team is working on."}
        actions={editor ? <ProjectFormButton members={members} /> : undefined}
      />
      {projects.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectCard p={p} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No projects yet">{editor ? "Create a project to track tasks, cabling, budgets and contractors." : "Nothing is scheduled right now."}</Empty>
      )}
      {dated.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-[15px] font-[510] text-fg-hi">Schedule</h2>
          <Gantt today={t} label="Project schedule" rows={dated.map((p) => ({ id: p.id, name: p.name, start: p.start!, end: p.end && p.end >= p.start! ? p.end : p.start!, color: p.color, done: p.status === "complete", href: `/projects/${p.id}` }))} />
        </section>
      )}
    </>
  );
}

function ProjectCard({ p }: { p: Project | ProjectSummary }) {
  const full = "progress" in p ? p : null;
  const pct = full?.progress.total ? (full.progress.done / full.progress.total) * 100 : 0;
  return (
    <Link href={`/projects/${p.id}`} className="flex h-full flex-col gap-2 rounded-[12px] border border-line bg-surface p-4 transition-colors hover:border-line-2 hover:bg-wash-2" style={{ borderTop: `2px solid ${p.color}` }}>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[15px] font-[510] text-fg-hi">{p.name}</span>
        <ProjectStatusBadge status={p.status} />
      </span>
      {p.summary && <span className="line-clamp-2 text-[13px] text-muted">{p.summary}</span>}
      <span className="mt-auto font-mono text-xs text-faint">
        {formatDay(p.start)} → {formatDay(p.end)}
      </span>
      {full && (
        <>
          <Meter pct={pct} />
          <span className="flex flex-wrap gap-x-3 text-xs text-muted">
            <span>
              {full.progress.done}/{full.progress.total} tasks
            </span>
            {full.progress.overdue > 0 && <span className="text-bad">{full.progress.overdue} overdue</span>}
            {full.budgetCents > 0 && <span>{formatMoney(full.budgetCents)} budget</span>}
          </span>
        </>
      )}
    </Link>
  );
}
