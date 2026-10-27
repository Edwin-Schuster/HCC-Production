import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { getSopDocument } from "@/server/services/sops";
import { listFeedback } from "@/server/services/feedback";
import { Empty, Page, PageHeader } from "@/components/page";
import { FeedbackList } from "./feedback-list";

export const metadata: Metadata = { title: "Feedback" };

export default function FeedbackPage({ params }: PageProps<"/sops/[id]/feedback">) {
  return (
    <Page>
      <Suspense fallback={<div className="h-96" />}>
        <Content params={params} />
      </Suspense>
    </Page>
  );
}

async function Content({ params }: { params: PageProps<"/sops/[id]/feedback">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/sops/${id}/feedback`);
  const db = await getDb();
  const [doc, items] = await Promise.all([getSopDocument(db, actor, id), listFeedback(db, actor, id)]);
  const open = items.filter((i) => i.status === "open").length;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-muted">
        <Link href={`/sops/${id}`} className="font-mono hover:text-fg-hi">
          {doc.sop.documentCode}
        </Link>
        <ChevronRight className="size-3" />
        <span>Feedback</span>
      </nav>
      <PageHeader title="Feedback from readers" subtitle={`${doc.sop.title} · ${open} open`} />
      {items.length === 0 ? (
        <Empty title="No feedback yet">Readers can flag any step as unclear or wrong from the SOP page. It arrives here and in the owner's inbox.</Empty>
      ) : (
        <FeedbackList sopId={id} items={items} canEdit={doc.canEdit} />
      )}
    </>
  );
}
