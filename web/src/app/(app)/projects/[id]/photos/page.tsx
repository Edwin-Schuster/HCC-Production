import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { listPhotos } from "@/server/services/photos";
import { loadProject } from "@/server/services/projects";
import { ProjectPhotos } from "@/components/work/photos";

export const metadata: Metadata = { title: "Photos" };

export default function PhotosPage(props: PageProps<"/projects/[id]/photos">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/projects/[id]/photos">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/projects/${id}/photos`);
  const db = await getDb();
  const project = await loadProject(db, actor, id);
  return <ProjectPhotos projectId={id} projectName={project.name} photos={await listPhotos(db, actor, id)} />;
}
