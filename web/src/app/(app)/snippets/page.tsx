import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus, Puzzle } from "lucide-react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { listSnippets } from "@/server/services/snippets";
import { Empty, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { LocalDate } from "@/components/local-date";

export const metadata: Metadata = { title: "Snippets" };

export default function SnippetsPage() {
  return (
    <Page>
      <PageHeader
        title="Snippets"
        subtitle="Blocks of steps shared by several SOPs, like a power-down sequence. Change a snippet once and every SOP that follows it updates."
        actions={
          <Button asChild variant="primary">
            <Link href="/snippets/new">
              <Plus /> New snippet
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<div className="h-64" />}>
        <List />
      </Suspense>
    </Page>
  );
}

async function List() {
  const actor = await requireRole("editor", "/snippets");
  const items = await listSnippets(await getDb(), actor);
  if (!items.length)
    return (
      <Empty title="No snippets yet" action={<Button asChild><Link href="/snippets/new">Create a snippet</Link></Button>}>
        Write the steps once, then insert them into any SOP with / Snippet.
      </Empty>
    );
  return (
    <ul role="list" className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
      {items.map((s) => (
        <li key={s.id}>
          <Link href={`/snippets/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-wash-2">
            <Puzzle className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-[510] text-fg-hi">{s.name}</span>
              {s.description && <span className="block truncate text-[13px] text-muted">{s.description}</span>}
            </span>
            <span className="hidden text-xs text-muted sm:block">
              {s.usedBy ? `Used in ${s.usedBy} SOP${s.usedBy === 1 ? "" : "s"}` : "Not used yet"}
            </span>
            <span className="font-mono text-xs text-faint">v{s.currentVersion}</span>
            <span className="hidden w-24 text-right text-xs text-faint sm:block">
              <LocalDate iso={s.updatedAt} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
