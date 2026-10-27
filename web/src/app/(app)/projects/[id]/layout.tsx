import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { getContext } from "@/server/context";
import { AppError } from "@/server/errors";
import { atLeast } from "@/server/permissions";
import { getProject } from "@/server/services/projects";
import { assignableMembers } from "@/server/services/tasks";
import { Empty, Page } from "@/components/page";
import { ProjectStatusBadge } from "@/components/work/badges";
import { ProjectFormButton } from "@/components/work/project-form";
import { ProjectTabs } from "@/components/work/project-tabs";
import { formatDay } from "@/lib/format";

const PROJECT_TABS: [string, string][] = [
  ["", "Overview"],
  ["tasks", "Tasks"],
  ["activity", "Activity"],
];

export default function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  return (
    <Page wide>
      <Suspense fallback={<div className="h-24" />}>
        <Header params={params} />
      </Suspense>
      {children}
    </Page>
  );
}

async function Header({ params }: { params: LayoutProps<"/projects/[id]">["params"] }) {
  const { id } = await params;
  const { db, actor } = await getContext();
  if (!actor.userId) return null;
  let project;
  try {
    project = await getProject(db, actor, id);
  } catch (e) {
    if (e instanceof AppError && e.status < 500) return <Empty title="Project not found">It may have been deleted.</Empty>;
    throw e;
  }
  const full = "progress" in project ? project : null;
  const members = full ? await assignableMembers(db, actor) : [];
  return (
    <>
      <Link href="/projects" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg-hi">
        <ChevronLeft className="size-3.5" /> Projects
      </Link>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-[22px] font-[510] tracking-[-0.012em] text-fg-hi sm:text-2xl">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: project.color }} aria-hidden />
            <span className="truncate">{project.name}</span>
            <ProjectStatusBadge status={project.status} />
          </h1>
          <p className="mt-1 font-mono text-xs text-muted">
            {formatDay(project.start)} → {formatDay(project.end)}
            {full?.leadName && <span className="font-sans"> · Lead: {full.leadName}</span>}
          </p>
        </div>
        {full && atLeast(actor, "editor") && (
          <div className="flex gap-2">
            <ProjectFormButton project={full} members={members} />
          </div>
        )}
      </header>
      {full && <ProjectTabs base={`/projects/${id}`} tabs={PROJECT_TABS} />}
    </>
  );
}
