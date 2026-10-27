import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { AppError } from "@/server/errors";
import { listCables } from "@/server/services/cabling";
import { loadProject } from "@/server/services/projects";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Cable labels", robots: { index: false } };

/** One label per cable end: "this end" and "other end", for label stock or plain paper. */
export default function CableLabelsPage(props: PageProps<"/print/cables/[projectId]">) {
  return (
    <Suspense>
      <Labels params={props.params} />
    </Suspense>
  );
}

async function Labels({ params }: { params: PageProps<"/print/cables/[projectId]">["params"] }) {
  const { projectId } = await params;
  const actor = await requireRole("editor", `/print/cables/${projectId}`);
  const db = await getDb();
  let project, cables;
  try {
    project = await loadProject(db, actor, projectId);
    cables = await listCables(db, actor, projectId);
  } catch (e) {
    if (e instanceof AppError && e.status < 500) notFound();
    throw e;
  }
  const ends = cables.flatMap((c) => [
    { key: `${c.id}-a`, id: `${c.label}-A`, type: c.type, here: c.from, there: c.to },
    { key: `${c.id}-b`, id: `${c.label}-B`, type: c.type, here: c.to, there: c.from },
  ]);
  return (
    <div data-theme="light" className="min-h-dvh bg-white px-6 py-8 text-[#1d1e21] print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-[510] text-black">Cable labels · {project.name}</h1>
          <p className="text-[13px] text-[#5f636a]">
            {cables.length} cables, {ends.length} labels. Print on label stock, one label per cable end.
          </p>
        </div>
        <PrintButton />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.6in,1fr))] gap-2 print:grid-cols-3 print:gap-1">
        {ends.map((e) => (
          <div key={e.key} className="flex break-inside-avoid flex-col gap-0.5 rounded-[4px] border border-[#c9ccd2] px-3 py-2 text-[11px] leading-tight">
            <b className="font-mono text-[16px] tracking-tight text-black">{e.id}</b>
            <span>{e.type}</span>
            <span>
              <span className="text-[#5f636a]">THIS END:</span> {e.here || "—"}
            </span>
            <span>
              <span className="text-[#5f636a]">OTHER END:</span> {e.there || "—"}
            </span>
          </div>
        ))}
      </div>
      {!ends.length && <p className="text-[#5f636a]">No cables in this project's schedule yet.</p>}
    </div>
  );
}
