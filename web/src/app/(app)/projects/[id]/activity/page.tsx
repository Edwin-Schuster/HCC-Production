import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { listActivity } from "@/server/services/activity";
import { loadProject } from "@/server/services/projects";
import { ActivityList } from "@/components/work/overview";

export const metadata: Metadata = { title: "Project activity" };

export default function ActivityPage(props: PageProps<"/projects/[id]/activity">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/projects/[id]/activity">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/projects/${id}/activity`);
  const db = await getDb();
  await loadProject(db, actor, id);
  return (
    <section className="max-w-3xl">
      <ActivityList items={await listActivity(db, actor, { projectId: id }, 300)} />
    </section>
  );
}
