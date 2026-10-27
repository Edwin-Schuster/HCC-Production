import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { getSopDocument } from "@/server/services/sops";
import { getQuiz, listTeamTraining } from "@/server/services/training";
import { listMembers } from "@/server/services/workspace";
import { Empty, Page, PageHeader } from "@/components/page";
import { TrainingTable } from "@/components/training-table";
import { AssignForm, QuizEditor } from "./training-forms";

export const metadata: Metadata = { title: "Training" };

export default function SopTrainingPage(props: PageProps<"/sops/[id]/training">) {
  return (
    <Page>
      <Suspense fallback={<div className="h-96" />}>
        <Content params={props.params} />
      </Suspense>
    </Page>
  );
}

async function Content({ params }: { params: PageProps<"/sops/[id]/training">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/sops/${id}/training`);
  const db = await getDb();
  const [doc, quiz, items, members] = await Promise.all([getSopDocument(db, actor, id), getQuiz(db, actor, id), listTeamTraining(db, actor, id), listMembers(db, actor)]);
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-muted">
        <Link href={`/sops/${id}`} className="font-mono hover:text-fg-hi">
          {doc.sop.documentCode}
        </Link>
        <ChevronRight className="size-3" />
        <span>Training</span>
      </nav>
      <PageHeader title="Training" subtitle={doc.sop.title} />
      <div className="grid gap-10">
        <section>
          <h2 className="text-[15px] text-fg-hi">Assign</h2>
          <p className="mb-3 mt-1 text-[13px] text-muted">People get a notification and the SOP appears under Training. They finish by passing the quiz, or by confirming they've read it if there's no quiz.</p>
          {doc.sop.currentVersionId ? <AssignForm sopId={id} members={members.map((m) => ({ id: m.id, name: m.name }))} /> : <Empty title="Publish the SOP first" />}
        </section>
        <section>
          <h2 className="mb-2 text-[15px] text-fg-hi">Progress</h2>
          {items.length ? <TrainingTable items={items} who="person" /> : <Empty title="No one assigned yet" />}
        </section>
        <section>
          <h2 className="text-[15px] text-fg-hi">Quiz</h2>
          <p className="mb-3 mt-1 text-[13px] text-muted">Optional multiple-choice questions. Leave it empty to skip the quiz.</p>
          <QuizEditor sopId={id} initial={quiz} />
        </section>
      </div>
    </>
  );
}
