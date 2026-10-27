import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { listCables } from "@/server/services/cabling";
import { loadProject } from "@/server/services/projects";
import { CablingView } from "@/components/work/cabling-view";

export const metadata: Metadata = { title: "Cabling" };

export default function CablingPage(props: PageProps<"/projects/[id]/cabling">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/projects/[id]/cabling">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/projects/${id}/cabling`);
  const db = await getDb();
  const project = await loadProject(db, actor, id);
  return <CablingView projectId={id} projectName={project.name} cables={await listCables(db, actor, id)} />;
}
