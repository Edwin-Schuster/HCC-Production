import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { listLayouts } from "@/server/services/cabling";
import { NewLayoutButton } from "@/components/work/layout-editor";
import { LayoutSvg } from "@/components/work/layout-svg";

export const metadata: Metadata = { title: "Room layouts" };

export default function LayoutsPage(props: PageProps<"/projects/[id]/layouts">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/projects/[id]/layouts">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/projects/${id}/layouts`);
  const layouts = await listLayouts(await getDb(), actor, id);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">Plan where gear goes and how cables run between rooms. Upload a floor plan or draw zones.</p>
        <NewLayoutButton projectId={id} />
      </div>
      {layouts.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {layouts.map((l) => (
            <li key={l.id}>
              <Link href={`/projects/${id}/layouts/${l.id}`} className="block overflow-hidden rounded-[12px] border border-line bg-surface hover:border-line-2">
                <LayoutSvg doc={l} mini className="border-b border-line" />
                <span className="block px-3 pb-2.5 pt-2">
                  <span className="block truncate text-[14px] font-[510] text-fg-hi">{l.name}</span>
                  <span className="text-xs text-muted">
                    {l.items.filter((i) => i.type !== "zone").length} devices · {l.runs.length} runs
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[12px] border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted">No layouts yet. Create one to place AV gear and draw cable runs.</p>
      )}
    </>
  );
}
