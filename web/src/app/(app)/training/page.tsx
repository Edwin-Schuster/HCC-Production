import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { atLeast } from "@/server/permissions";
import { listMyTraining, listTeamTraining } from "@/server/services/training";
import { Empty, Page, PageHeader } from "@/components/page";
import { TrainingTable } from "@/components/training-table";

export const metadata: Metadata = { title: "Training" };

export default function TrainingPage() {
  return (
    <Page>
      <PageHeader title="Training" subtitle="SOPs you've been asked to learn. Read each one and, if it has a quiz, pass it." />
      <Suspense fallback={<div className="h-64" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("viewer", "/training");
  const db = await getDb();
  const mine = await listMyTraining(db, actor);
  const team = atLeast(actor, "editor") ? (await listTeamTraining(db, actor)).filter((t) => !t.completedAt) : [];
  return (
    <div className="grid gap-8">
      <section>
        <h2 className="mb-2 text-[13px] font-[510] text-muted">Yours</h2>
        {mine.length ? <TrainingTable items={mine} who="sop" /> : <Empty title="Nothing assigned to you">When someone assigns you an SOP to learn, it shows up here.</Empty>}
      </section>
      {atLeast(actor, "editor") && (
        <section>
          <h2 className="mb-2 text-[13px] font-[510] text-muted">Team, not finished yet</h2>
          {team.length ? <TrainingTable items={team} who="both" /> : <Empty title="Everyone is up to date">Assign training from an SOP's ⋯ menu.</Empty>}
        </section>
      )}
    </div>
  );
}
