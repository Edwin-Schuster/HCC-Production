import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { listReviews, type ReviewItem } from "@/server/services/reviews";
import { Empty, Page, PageHeader } from "@/components/page";
import { LocalDate } from "@/components/local-date";
import { ReviewBadge } from "@/components/sop/status";
import { MarkReviewedButton } from "@/components/sop/mark-reviewed";

export const metadata: Metadata = { title: "Reviews" };

export default function ReviewsPage() {
  return (
    <Page>
      <PageHeader title="Reviews" subtitle="Every published SOP has a review date. Owners get a reminder a week before, then weekly while it's overdue." />
      <Suspense fallback={<div className="h-96" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("editor", "/reviews");
  const items = await listReviews(await getDb(), actor);
  if (!items.length) return <Empty title="No published SOPs yet">Review dates start when an SOP is first published.</Empty>;
  const groups: [string, ReviewItem[]][] = [
    ["Overdue", items.filter((i) => i.state === "overdue")],
    ["Due in the next two weeks", items.filter((i) => i.state === "due")],
    ["Later", items.filter((i) => i.state === "ok")],
  ];
  return (
    <div className="grid gap-8">
      {groups
        .filter(([, list]) => list.length)
        .map(([label, list]) => (
          <section key={label}>
            <h2 className="mb-2 text-[13px] font-[510] text-muted">
              {label} <span className="font-mono text-faint">{list.length}</span>
            </h2>
            <ul role="list" className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
              {list.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-24 font-mono text-xs text-muted">{r.documentCode}</span>
                  <Link href={`/sops/${r.id}`} className="min-w-0 flex-1 truncate text-[14px] text-fg-hi hover:underline">
                    {r.title}
                  </Link>
                  <span className="hidden text-xs text-muted sm:block">{r.ownerName}</span>
                  <ReviewBadge state={r.state} />
                  <span className="w-24 text-right text-xs text-muted">
                    <LocalDate iso={r.nextReviewAt} />
                  </span>
                  {r.state !== "ok" && (
                    <MarkReviewedButton sopId={r.id} title={r.title}>
                      Mark reviewed
                    </MarkReviewedButton>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
