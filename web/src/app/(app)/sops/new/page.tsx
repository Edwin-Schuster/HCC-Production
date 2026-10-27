import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { canViewFolder } from "@/server/permissions";
import { listFolders } from "@/server/services/folders";
import { listTemplates } from "@/server/services/sops";
import { Page, PageHeader } from "@/components/page";
import { NewSopForm } from "./new-sop-form";

export const metadata: Metadata = { title: "New SOP" };

export default function NewSopPage(props: PageProps<"/sops/new">) {
  return (
    <Page>
      <PageHeader title="New SOP" subtitle="Pick a starting point. You can change everything afterwards." />
      <Suspense fallback={<div className="h-96" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/sops/new">["searchParams"] }) {
  const actor = await requireRole("editor", "/sops/new");
  const sp = await searchParams;
  const db = await getDb();
  const [folders, templates] = await Promise.all([listFolders(db, actor), listTemplates(db, actor)]);
  return (
    <NewSopForm
      folders={folders.filter((f) => canViewFolder(actor, f.visibility)).map((f) => ({ id: f.id, label: `${"  ".repeat(f.depth)}${f.name}`, prefix: f.codePrefix }))}
      templates={[{ key: "", name: "Blank", description: "An empty page. Type / to add blocks." }, ...templates]}
      defaultFolder={typeof sp.folder === "string" ? sp.folder : undefined}
    />
  );
}
