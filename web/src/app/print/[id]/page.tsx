import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SopBody } from "@/blocks/render";
import { totalDuration } from "@/blocks/tree";
import { getContext } from "@/server/context";
import { AppError } from "@/server/errors";
import { getSopDocument } from "@/server/services/sops";
import { MetaHeader } from "@/components/sop/meta-header";

export const metadata: Metadata = { title: "Print", robots: { index: false } };

/** Print layout used for PDF export (and browser printing). Same components as the reading view. */
export default function PrintPage(props: PageProps<"/print/[id]">) {
  return (
    <Suspense>
      <PrintDoc params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function PrintDoc({ params, searchParams }: { params: PageProps<"/print/[id]">["params"]; searchParams: PageProps<"/print/[id]">["searchParams"] }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { db, actor } = await getContext();
  const want = sp.draft ? "draft" : typeof sp.v === "string" && /^\d+$/.test(sp.v) ? Number(sp.v) : undefined;
  let doc;
  try {
    doc = await getSopDocument(db, actor, id, want);
  } catch (e) {
    if (e instanceof AppError && e.status < 500) notFound();
    throw e;
  }
  const watermark = sp.watermark === "draft" ? "DRAFT" : sp.watermark === "confidential" ? "CONFIDENTIAL" : doc.version.isDraft ? "DRAFT" : null;
  return (
    <div data-theme="light" className="print-doc min-h-dvh bg-white px-8 py-10 text-fg-2 print:p-0">
      {watermark && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 grid place-items-center">
          <span className="-rotate-[30deg] select-none text-[110px] font-[510] tracking-[0.08em] text-black/[0.06]">{watermark}</span>
        </div>
      )}
      <div className="relative z-10 mx-auto max-w-[720px]">
        <MetaHeader doc={doc} totalMinutes={totalDuration(doc.blocks)} print />
        {!doc.version.isDraft && doc.version.changeSummary && (
          <p className="mt-3 text-[12px] text-muted">
            v{doc.version.number}: {doc.version.changeSummary}
          </p>
        )}
        <div className="mt-6">
          <SopBody blocks={doc.blocks} roles={doc.roles} snippets={doc.snippets} print />
        </div>
      </div>
    </div>
  );
}
