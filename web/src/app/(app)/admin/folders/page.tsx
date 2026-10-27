import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { listFolders } from "@/server/services/folders";
import { listSops } from "@/server/services/sops";
import { Page, PageHeader } from "@/components/page";
import { FolderManager } from "./folder-manager";

export const metadata: Metadata = { title: "Folders" };

export default function FoldersPage() {
  return (
    <Page>
      <PageHeader title="Folders" subtitle="Top-level folders act as departments in search. The code prefix sets document codes, like SOP-AUD-001." />
      <Suspense fallback={<div className="h-96" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("admin", "/admin/folders");
  const db = await getDb();
  const [folders, sops] = await Promise.all([listFolders(db, actor), listSops(db, actor)]);
  const counts: Record<string, number> = {};
  for (const s of sops) counts[s.folderId] = (counts[s.folderId] ?? 0) + 1;
  return <FolderManager folders={folders.map((f) => ({ ...f, count: counts[f.id] ?? 0 }))} />;
}
