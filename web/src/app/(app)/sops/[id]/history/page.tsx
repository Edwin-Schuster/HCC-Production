import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { getContext } from "@/server/context";
import { AppError } from "@/server/errors";
import { getSopDocument, listVersions } from "@/server/services/sops";
import { Empty, Page, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocalDate } from "@/components/local-date";

export const metadata: Metadata = { title: "Version history" };

export default function HistoryPage(props: PageProps<"/sops/[id]/history">) {
  return (
    <Page>
      <Suspense fallback={<div className="h-96" />}>
        <History params={props.params} />
      </Suspense>
    </Page>
  );
}

async function History({ params }: { params: PageProps<"/sops/[id]/history">["params"] }) {
  const { id } = await params;
  const { db, actor } = await getContext();
  let doc, versions;
  try {
    [doc, versions] = await Promise.all([getSopDocument(db, actor, id), listVersions(db, actor, id)]);
  } catch (e) {
    if (e instanceof AppError && e.status < 500) return <Empty title="This SOP isn't available">{e.message}</Empty>;
    throw e;
  }
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-muted">
        <Link href={`/sops/${id}`} className="hover:text-fg-hi">
          <span className="font-mono">{doc.sop.documentCode}</span> · {doc.sop.title}
        </Link>
        <ChevronRight className="size-3" />
        <span>History</span>
      </nav>
      <PageHeader
        title="Version history"
        subtitle="Every published version is kept exactly as it was published."
        actions={
          doc.sop.hasDraft &&
          doc.canEdit && (
            <Button asChild size="sm">
              <Link href={`/sops/${id}?draft=1`}>Preview current draft</Link>
            </Button>
          )
        }
      />
      {versions.length === 0 ? (
        <Empty title="Not published yet">The first publish creates version 1.</Empty>
      ) : (
        <ol className="relative grid gap-3 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-line">
          {versions.map((v) => (
            <li key={v.id} className="relative flex gap-4">
              <span className={`z-10 mt-3 grid size-[31px] shrink-0 place-items-center rounded-full border font-mono text-[11px] ${v.isCurrent ? "border-fg-2 bg-surface-2 text-fg-hi" : "border-line bg-bg text-muted"}`}>v{v.number}</span>
              <Link href={v.isCurrent ? `/sops/${id}` : `/sops/${id}?v=${v.number}`} className="min-w-0 flex-1 rounded-[12px] border border-line bg-surface px-4 py-3 transition-colors hover:border-line-2 hover:bg-surface-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] text-fg-hi">{v.changeSummary || "No summary"}</span>
                  {v.isCurrent && <Badge tone="good">Current</Badge>}
                </div>
                <div className="mt-1 text-xs text-muted">
                  <LocalDate iso={v.publishedAt} withTime /> · {v.publishedByName} · “{v.title}”
                  {v.approvedByNames.length > 0 && <> · approved by {v.approvedByNames.join(", ")}</>}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
