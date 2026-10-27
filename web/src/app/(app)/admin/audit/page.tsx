import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/server/context";
import { listAudit } from "@/server/services/audit";
import { requireRole } from "@/server/context";
import { Empty, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { AuditList } from "@/components/audit-list";

export const metadata: Metadata = { title: "Audit log" };

const FILTERS = [
  ["", "Everything"],
  ["sop.", "SOPs"],
  ["sop.published", "Publishing"],
  ["sop.approved", "Approvals"],
  ["snippet.", "Snippets"],
  ["folder.", "Folders"],
  ["workspace.", "Settings"],
  ["apikey.", "API keys"],
  ["webhook.", "Webhooks"],
] as const;

export default function AuditPage(props: PageProps<"/admin/audit">) {
  return (
    <Page>
      <PageHeader title="Audit log" subtitle="Every change to published SOPs, approvals, snippets, folders and settings, with who made it. It can't be edited." />
      <Suspense fallback={<div className="h-96" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/admin/audit">["searchParams"] }) {
  await requireRole("admin", "/admin/audit");
  const sp = await searchParams;
  const { db, actor } = await getContext();
  const action = typeof sp.action === "string" ? sp.action : "";
  const before = typeof sp.before === "string" && !Number.isNaN(Date.parse(sp.before)) ? sp.before : undefined;
  const { items, next } = await listAudit(db, actor, { action: action || undefined, before, limit: 100 });
  return (
    <>
      <form className="mb-4 flex items-center gap-2" action="/admin/audit">
        <Select name="action" defaultValue={action} aria-label="Show" className="w-48">
          {FILTERS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm">
          Filter
        </Button>
      </form>
      {items.length ? <AuditList items={items} /> : <Empty title="Nothing recorded yet" />}
      {next && (
        <div className="mt-4 flex justify-center">
          <Button asChild size="sm">
            <Link href={`/admin/audit?${new URLSearchParams({ ...(action ? { action } : {}), before: next })}`}>Older</Link>
          </Button>
        </div>
      )}
    </>
  );
}
