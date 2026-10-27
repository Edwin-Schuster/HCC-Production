import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { AppError } from "@/server/errors";
import { gearOptions, getLayout, listCables } from "@/server/services/cabling";
import { LayoutEditor } from "@/components/work/layout-editor";

export const metadata: Metadata = { title: "Room layout" };

export default function LayoutPage(props: PageProps<"/projects/[id]/layouts/[layoutId]">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/projects/[id]/layouts/[layoutId]">["params"] }) {
  const { id, layoutId } = await params;
  const actor = await requireRole("editor", `/projects/${id}/layouts/${layoutId}`);
  const db = await getDb();
  let layout;
  try {
    layout = await getLayout(db, actor, layoutId);
  } catch (e) {
    if (e instanceof AppError && e.status < 500) notFound();
    throw e;
  }
  if (layout.projectId !== id) notFound();
  const [cables, gear] = await Promise.all([listCables(db, actor, id), gearOptions(db, actor)]);
  return <LayoutEditor key={layout.id} layout={layout} cables={cables.map((c) => ({ id: c.id, label: c.label, type: c.type }))} gear={gear} />;
}
