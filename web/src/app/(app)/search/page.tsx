import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CornerDownRight, Search } from "lucide-react";
import { getContext } from "@/server/context";
import { listFolders } from "@/server/services/folders";
import { searchSops } from "@/server/services/search";
import { listAllTags } from "@/server/services/sops";
import { listMembers } from "@/server/services/workspace";
import { atLeast } from "@/server/permissions";
import { Empty, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Highlighted } from "@/components/highlighted";
import { STATUS_OPTIONS, StatusBadge } from "@/components/sop/status";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage(props: PageProps<"/search">) {
  return (
    <Page>
      <PageHeader title="Search" subtitle="Search titles, steps, warnings, expected results, tables and tags." />
      <Suspense fallback={<div className="h-96" />}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </Page>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const sp = await searchParams;
  const { db, actor } = await getContext();
  const f = { q: one(sp.q) ?? "", ownerId: one(sp.owner), tag: one(sp.tag), status: one(sp.status) as never, departmentId: one(sp.dept) };
  const [results, folders, tags, members] = await Promise.all([searchSops(db, actor, { ...f, limit: 40 }), listFolders(db, actor), listAllTags(db, actor), listMembers(db, actor)]);
  const departments = folders.filter((x) => x.depth === 0);
  const filtered = Boolean(f.ownerId || f.tag || f.status || f.departmentId);
  return (
    <>
      <form action="/search" className="mb-6 grid gap-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input name="q" defaultValue={f.q} placeholder="e.g. amp power order, stream key, batteries" className="h-11 pl-9 text-[15px]" autoFocus aria-label="Search" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Select name="dept" defaultValue={f.departmentId ?? ""} className="h-8 w-auto text-[13px]" aria-label="Department">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select name="tag" defaultValue={f.tag ?? ""} className="h-8 w-auto text-[13px]" aria-label="Tag">
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          {members.length > 0 && (
            <Select name="owner" defaultValue={f.ownerId ?? ""} className="h-8 w-auto text-[13px]" aria-label="Owner">
              <option value="">Any owner</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
          {atLeast(actor, "editor") && (
            <Select name="status" defaultValue={f.status ?? ""} className="h-8 w-auto text-[13px]" aria-label="Status">
              <option value="">Any status</option>
              {STATUS_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
          <Button type="submit" size="sm" variant="primary">
            Search
          </Button>
          {(filtered || f.q) && (
            <Button asChild size="sm" variant="ghost">
              <Link href="/search">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      {!f.q && !filtered ? (
        <Empty title="Type what you're looking for">Results show the exact step that matches, not just the SOP title.</Empty>
      ) : results.length === 0 ? (
        <Empty title="No matches">Try fewer or different words{filtered ? ", or clear the filters" : ""}.</Empty>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {results.length} SOP{results.length === 1 ? "" : "s"}
          </p>
          <ul className="grid gap-2.5" role="list">
            {results.map((r) => (
              <li key={r.id} className="rounded-[12px] border border-line bg-surface">
                <Link href={`/sops/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 hover:text-fg-hi">
                  <span className="font-mono text-xs text-muted">{r.documentCode}</span>
                  <span className="text-[14.5px] font-[510] text-fg-hi">{r.title}</span>
                  <span className="text-xs text-muted">{r.folderName}</span>
                  <span className="flex-1" />
                  <StatusBadge status={r.status} />
                </Link>
                {r.hits.length > 0 ? (
                  <ul className="mt-2 grid gap-px pb-2" role="list">
                    {r.hits.map((h) => (
                      <li key={h.blockId}>
                        <Link href={`/sops/${r.id}#b-${h.blockId}`} className="flex gap-2.5 px-4 py-1.5 text-[13.5px] text-fg-2 hover:bg-wash-2">
                          <CornerDownRight className="mt-[3px] size-3.5 shrink-0 text-faint" />
                          <span className="min-w-0">
                            <span className="text-xs text-muted">
                              {h.label}
                              {h.context && h.type !== "step" ? ` · ${h.context}` : ""}
                            </span>
                            <span className="block">
                              <Highlighted text={h.snippet} />
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 pb-3 pt-1 text-[13px] text-muted">{r.titleMatch ? "Matched the title, code or tags." : r.summary}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
