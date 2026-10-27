import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { diffVersions, summarize } from "@/blocks/diff";
import { getContext } from "@/server/context";
import { getSopDocument, listVersions } from "@/server/services/sops";
import { canReadDrafts } from "@/server/permissions";
import { Empty, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { DiffView } from "@/components/sop/diff-view";

export const metadata: Metadata = { title: "Compare versions" };

export default function ComparePage(props: PageProps<"/sops/[id]/compare">) {
  return (
    <Page>
      <Suspense fallback={<div className="h-96" />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </Page>
  );
}

const parseVersion = (v: unknown): number | "draft" | undefined => (v === "draft" ? "draft" : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);

async function Content({ params, searchParams }: { params: PageProps<"/sops/[id]/compare">["params"]; searchParams: PageProps<"/sops/[id]/compare">["searchParams"] }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { db, actor } = await getContext();
  const versions = await listVersions(db, actor, id);
  const current = await getSopDocument(db, actor, id);
  const hasDraft = current.sop.hasDraft && canReadDrafts(actor);
  const options = [...(hasDraft ? [{ value: "draft", label: "Draft" }] : []), ...versions.map((v) => ({ value: String(v.number), label: `v${v.number}${v.isCurrent ? " (current)" : ""}` }))];
  if (options.length < 2) return <Empty title="Nothing to compare yet">Comparing needs at least two versions, or a published version and a draft.</Empty>;

  const to = parseVersion(sp.to) ?? (options[0].value === "draft" ? "draft" : Number(options[0].value));
  const from = parseVersion(sp.from) ?? Number(options.find((o) => o.value !== String(to))!.value);
  const [a, b] = await Promise.all([getSopDocument(db, actor, id, from), getSopDocument(db, actor, id, to)]);
  const entries = diffVersions(a.blocks, b.blocks);
  const s = summarize(entries);
  const full = sp.full === "1";
  const label = (v: number | "draft") => (v === "draft" ? "the draft" : `v${v}`);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-muted">
        <Link href={`/sops/${id}`} className="font-mono hover:text-fg-hi">
          {current.sop.documentCode}
        </Link>
        <ChevronRight className="size-3" />
        <Link href={`/sops/${id}/history`} className="hover:text-fg-hi">
          History
        </Link>
        <ChevronRight className="size-3" />
        <span>Compare</span>
      </nav>
      <PageHeader title={`What changed from ${label(from)} to ${label(to)}`} subtitle={current.sop.title} />
      <form className="mb-5 flex flex-wrap items-center gap-2 text-[13px]" action={`/sops/${id}/compare`}>
        <Select name="from" defaultValue={String(from)} aria-label="From version" className="w-36">
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <span className="text-muted">→</span>
        <Select name="to" defaultValue={String(to)} aria-label="To version" className="w-36">
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <label className="ml-2 flex items-center gap-1.5 text-muted">
          <input type="checkbox" name="full" value="1" defaultChecked={full} /> Show unchanged
        </label>
        <Button type="submit" size="sm">
          Compare
        </Button>
      </form>
      {a.version.title !== b.version.title && (
        <p className="mb-3 text-[13px] text-muted">
          Title: <del className="text-bad">{a.version.title}</del> → <ins className="text-good no-underline">{b.version.title}</ins>
        </p>
      )}
      <p className="mb-3 flex flex-wrap gap-3 text-[13px]">
        <span className="text-good">{s.added} added</span>
        <span className="text-bad">{s.removed} removed</span>
        <span className="text-warn">{s.changed} changed</span>
        <span className="text-iris-text">{s.moved} moved</span>
      </p>
      {s.added + s.removed + s.changed + s.moved === 0 && !full ? <Empty title="No differences">These versions have the same content.</Empty> : <DiffView entries={entries} full={full} />}
    </>
  );
}
