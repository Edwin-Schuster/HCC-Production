import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { listPorts } from "@/server/services/network";
import { loadProject } from "@/server/services/projects";
import { NetworkView } from "@/components/work/network-view";

export const metadata: Metadata = { title: "Network" };

export default function NetworkPage(props: PageProps<"/projects/[id]/network">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/projects/[id]/network">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/projects/${id}/network`);
  const db = await getDb();
  const project = await loadProject(db, actor, id);
  return <NetworkView projectId={id} projectName={project.name} ports={await listPorts(db, actor, id)} />;
}
