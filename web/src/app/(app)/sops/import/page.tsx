import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { listFolders } from "@/server/services/folders";
import { listTeamRoles } from "@/server/services/sops";
import { Page, PageHeader } from "@/components/page";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import SOP" };

export default function ImportPage() {
  return (
    <Page>
      <PageHeader title="Import an SOP" subtitle="From Word, Google Docs or Markdown. Headings become sections and numbered lists become steps. You'll see a preview before anything is saved." />
      <Suspense fallback={<div className="h-96" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("editor", "/sops/import");
  const db = await getDb();
  const [folders, roles] = await Promise.all([listFolders(db, actor), listTeamRoles(db, actor)]);
  return <ImportForm folders={folders.map((f) => ({ id: f.id, label: `${"  ".repeat(f.depth)}${f.name}` }))} roles={Object.fromEntries(roles.map((r) => [r.id, r.name]))} />;
}
