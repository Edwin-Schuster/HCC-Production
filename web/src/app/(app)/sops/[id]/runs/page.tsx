import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { getSopDocument } from "@/server/services/sops";
import { listRuns } from "@/server/services/runs";
import { Empty, Page, PageHeader } from "@/components/page";
import { RunsTable } from "@/components/sop/runs-table";
import { StartRunButton } from "@/components/sop/start-run";

export const metadata: Metadata = { title: "Runs" };

export default function SopRunsPage({ params }: PageProps<"/sops/[id]/runs">) {
  return (
    <Page>
      <Suspense fallback={<div className="h-64" />}>
        <Content params={params} />
      </Suspense>
    </Page>
  );
}

async function Content({ params }: { params: PageProps<"/sops/[id]/runs">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("viewer", `/sops/${id}/runs`);
  const db = await getDb();
  const [doc, runs] = await Promise.all([getSopDocument(db, actor, id), listRuns(db, actor, { sopId: id, limit: 200 })]);
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-muted">
        <Link href={`/sops/${id}`} className="font-mono hover:text-fg-hi">
          {doc.sop.documentCode}
        </Link>
        <ChevronRight className="size-3" />
        <span>Runs</span>
      </nav>
      <PageHeader title="Runs" subtitle={doc.sop.title} actions={doc.sop.currentVersionId && doc.sop.status !== "retired" ? <StartRunButton sopId={id} /> : null} />
      {runs.length ? <RunsTable runs={runs} /> : <Empty title="No runs yet">Start a run to work through this SOP as a checklist.</Empty>}
    </>
  );
}
