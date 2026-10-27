import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { SopBody } from "@/blocks/render";
import { totalDuration } from "@/blocks/tree";
import { getSopDocument } from "@/server/services/sops";
import { openTraining } from "@/server/services/training";
import { MetaHeader } from "@/components/sop/meta-header";
import { LocalDate } from "@/components/local-date";
import { TrainingFinish } from "./training-finish";

export const metadata: Metadata = { title: "Training" };

export default function TrainingItemPage(props: PageProps<"/training/[id]">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/training/[id]">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("viewer", `/training/${id}`);
  const db = await getDb();
  const { assignment: a, quiz, isMine } = await openTraining(db, actor, id);
  const doc = await getSopDocument(db, actor, a.sopId);
  return (
    <div className="mx-auto w-full max-w-[780px] px-[max(16px,env(safe-area-inset-left))] py-6 sm:px-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-muted">
        <Link href="/training" className="hover:text-fg-hi">
          Training
        </Link>
        <ChevronRight className="size-3" />
        <span>{isMine ? "Yours" : a.userName}</span>
      </nav>
      <div className="mb-6 rounded-[12px] border border-line bg-surface px-4 py-3 text-[13px] text-fg-2">
        {a.assignedByName ? `${a.assignedByName} asked ${isMine ? "you" : a.userName} to learn this SOP` : "Assigned training"}
        {a.dueAt && (
          <>
            {" "}by <LocalDate iso={a.dueAt} />
          </>
        )}
        .{a.note && <p className="mt-1 text-muted">“{a.note}”</p>}
      </div>
      <MetaHeader doc={doc} totalMinutes={totalDuration(doc.blocks)} />
      <div className="mt-8">
        <SopBody blocks={doc.blocks} roles={doc.roles} snippets={doc.snippets} />
      </div>
      <div className="mt-12 border-t border-line pt-8">
        {a.completedAt ? (
          <p className="text-[14px] text-good">
            Finished <LocalDate iso={a.completedAt} />
            {a.completedVersion ? ` on v${a.completedVersion}` : ""}
            {a.bestScore ? ` · quiz ${a.bestScore.score}/${a.bestScore.total}` : ""}.
          </p>
        ) : isMine ? (
          <TrainingFinish assignmentId={a.id} quiz={quiz} />
        ) : (
          <p className="text-[14px] text-muted">Not finished yet.</p>
        )}
      </div>
    </div>
  );
}
