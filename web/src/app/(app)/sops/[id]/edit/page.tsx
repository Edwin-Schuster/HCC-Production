import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { AppError } from "@/server/errors";
import { getEditorState, getSopDocument, listTeamRoles } from "@/server/services/sops";
import { EditorLoader } from "@/editor/loader";
import { Empty } from "@/components/page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Edit SOP" };

export default function EditPage(props: PageProps<"/sops/[id]/edit">) {
  return (
    <Suspense fallback={<div className="h-dvh" />}>
      <Editor params={props.params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/sops/[id]/edit">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/sops/${id}/edit`);
  const db = await getDb();
  let data;
  try {
    data = await Promise.all([getEditorState(db, actor, id), getSopDocument(db, actor, id), listTeamRoles(db, actor)]);
  } catch (e) {
    if (!(e instanceof AppError && e.status < 500)) throw e;
    return (
      <div className="mx-auto max-w-[720px] px-4 py-16">
        <Empty
          title="You can't edit this SOP"
          action={
            <Button asChild>
              <Link href={`/sops/${id}`}>Back to the SOP</Link>
            </Button>
          }
        >
          {e.message}
        </Empty>
      </div>
    );
  }
  const [state, doc, roles] = data;
  return (
    <EditorLoader
      sopId={id}
      documentCode={doc.sop.documentCode}
      folderName={doc.sop.folderName}
      published={Boolean(doc.sop.currentVersionId)}
      initial={state}
      roles={roles}
    />
  );
}
