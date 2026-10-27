import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { listRuns } from "@/server/services/runs";
import { Empty, Page, PageHeader } from "@/components/page";
import { RunsTable } from "@/components/sop/runs-table";

export const metadata: Metadata = { title: "Runs" };

export default function RunsPage() {
  return (
    <Page>
      <PageHeader title="Runs" subtitle="Each time someone works through an SOP as a checklist. Start one from any published SOP." />
      <Suspense fallback={<div className="h-64" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("viewer", "/runs");
  const db = await getDb();
  const [active, recent] = await Promise.all([listRuns(db, actor, { status: "in_progress" }), listRuns(db, actor, { limit: 50 })]);
  const finished = recent.filter((r) => r.status !== "in_progress");
  if (!active.length && !finished.length) return <Empty title="No runs yet">Open a published SOP and press Run to work through it step by step. Ticks, times and notes are saved.</Empty>;
  return (
    <div className="grid gap-8">
      {active.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-[510] text-muted">In progress</h2>
          <RunsTable runs={active} showSop />
        </section>
      )}
      {finished.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-[510] text-muted">Recent</h2>
          <RunsTable runs={finished} showSop />
        </section>
      )}
    </div>
  );
}
