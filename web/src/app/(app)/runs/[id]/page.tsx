import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { checkable, getRun } from "@/server/services/runs";
import { RunView } from "@/components/sop/run-view";

export const metadata: Metadata = { title: "Run" };

export default function RunPage({ params }: PageProps<"/runs/[id]">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/runs/[id]">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("viewer", `/runs/${id}`);
  const data = await getRun(await getDb(), actor, id);
  const { doc, run } = data;
  return (
    <RunView
      run={run}
      sop={{ id: doc.sop.id, title: doc.version.title, documentCode: doc.sop.documentCode }}
      blocks={doc.blocks}
      roles={doc.roles}
      snippets={doc.snippets}
      checkableIds={checkable(doc.blocks).map((b) => b.id)}
      state={data.state}
      canFinish={data.canFinish}
    />
  );
}
