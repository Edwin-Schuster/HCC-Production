import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { getSnippet } from "@/server/services/snippets";
import { listTeamRoles } from "@/server/services/sops";
import { atLeast } from "@/server/permissions";
import { SnippetEditorLoader } from "@/editor/loader";

export const metadata: Metadata = { title: "Snippet" };

export default function SnippetPage({ params }: PageProps<"/snippets/[id]">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/snippets/[id]">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/snippets/${id}`);
  const db = await getDb();
  const [snippet, roles] = await Promise.all([id === "new" ? null : getSnippet(db, actor, id), listTeamRoles(db, actor)]);
  return <SnippetEditorLoader snippet={snippet} roles={roles} canDelete={atLeast(actor, "admin")} />;
}
