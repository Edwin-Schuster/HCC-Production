import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { toMermaid } from "@/blocks/flowchart";
import { walk } from "@/blocks/tree";
import { getContext } from "@/server/context";
import { getSopDocument } from "@/server/services/sops";
import { Empty, Page, PageHeader } from "@/components/page";
import { Flowchart } from "@/components/sop/flowchart";

export const metadata: Metadata = { title: "Flowchart" };

export default function FlowPage(props: PageProps<"/sops/[id]/flow">) {
  return (
    <Page wide>
      <Suspense fallback={<div className="h-96" />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ params, searchParams }: { params: PageProps<"/sops/[id]/flow">["params"]; searchParams: PageProps<"/sops/[id]/flow">["searchParams"] }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { db, actor } = await getContext();
  const want = sp.draft ? "draft" : typeof sp.v === "string" && /^\d+$/.test(sp.v) ? Number(sp.v) : undefined;
  const doc = await getSopDocument(db, actor, id, want);
  const hasSteps = [...walk(doc.blocks)].some((x) => x.node.type === "step");
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-muted">
        <Link href={`/sops/${id}`} className="font-mono hover:text-fg-hi">
          {doc.sop.documentCode}
        </Link>
        <ChevronRight className="size-3" />
        <span>Flowchart</span>
      </nav>
      <PageHeader
        title="Flowchart"
        subtitle={`${doc.version.title} · ${doc.version.isDraft ? "draft" : `v${doc.version.number}`}. Drawn from the steps; dashed arrows are branches (“if this happens, go to step N”).`}
      />
      {hasSteps ? <Flowchart source={toMermaid(doc.blocks)} /> : <Empty title="No steps to draw">Add numbered steps to the SOP and the flowchart draws itself.</Empty>}
    </>
  );
}
