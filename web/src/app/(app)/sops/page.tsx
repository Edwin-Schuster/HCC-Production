import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { getContext } from "@/server/context";
import { atLeast } from "@/server/permissions";
import { descendantIds, listFolders } from "@/server/services/folders";
import { listAllTags, listSops } from "@/server/services/sops";
import { listMembers } from "@/server/services/workspace";
import { Empty, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { ReviewBadge, STATUS_OPTIONS, StatusBadge } from "@/components/sop/status";
import { LocalDate } from "@/components/local-date";

export const metadata: Metadata = { title: "SOPs" };

export default function LibraryPage(props: PageProps<"/sops">) {
  return (
    <Page wide>
      <Suspense fallback={<ListSkeleton />}>
        <Library searchParams={props.searchParams} />
      </Suspense>
    </Page>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

async function Library({ searchParams }: { searchParams: PageProps<"/sops">["searchParams"] }) {
  const sp = await searchParams;
  const { db, actor } = await getContext();
  const folders = await listFolders(db, actor);
  const folderId = one(sp.folder);
  const folder = folders.find((f) => f.id === folderId);
  const filters = { tag: one(sp.tag), status: one(sp.status) as never, ownerId: one(sp.owner) };
  const [sops, tags, members] = await Promise.all([
    listSops(db, actor, { ...filters, folderIds: folder ? [...descendantIds(folders, folder.id)] : undefined }),
    listAllTags(db, actor),
    listMembers(db, actor),
  ]);
  const editor = atLeast(actor, "editor");
  const path = folder ? folders.filter((f) => descendantIds(folders, f.id).has(folder.id)).map((f) => f.name) : [];

  return (
    <>
      <PageHeader
        eyebrow={folder ? path.slice(0, -1).join(" / ") || "Folder" : "Library"}
        title={folder?.name ?? "All SOPs"}
        subtitle={`${sops.length} procedure${sops.length === 1 ? "" : "s"}${!actor.userId ? " · showing public SOPs. Sign in to see the rest." : ""}`}
        actions={
          editor && (
            <Button asChild variant="primary">
              <Link href={`/sops/new${folder ? `?folder=${folder.id}` : ""}`}>
                <Plus /> New SOP
              </Link>
            </Button>
          )
        }
      />
      <form className="mb-4 flex flex-wrap items-center gap-2" action="/sops">
        {folder && <input type="hidden" name="folder" value={folder.id} />}
        <Select name="tag" defaultValue={filters.tag ?? ""} className="h-8 w-auto text-[13px]" aria-label="Tag">
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        {editor && (
          <Select name="status" defaultValue={filters.status ?? ""} className="h-8 w-auto text-[13px]" aria-label="Status">
            <option value="">Any status</option>
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        )}
        {members.length > 0 && (
          <Select name="owner" defaultValue={filters.ownerId ?? ""} className="h-8 w-auto text-[13px]" aria-label="Owner">
            <option value="">Any owner</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        )}
        <Button size="sm" type="submit">
          Filter
        </Button>
        {(filters.tag || filters.status || filters.ownerId) && (
          <Button asChild size="sm" variant="ghost">
            <Link href={folder ? `/sops?folder=${folder.id}` : "/sops"}>Clear</Link>
          </Button>
        )}
      </form>

      {sops.length === 0 ? (
        <Empty
          title={filters.tag || filters.status || filters.ownerId ? "No SOPs match these filters" : "No SOPs here yet"}
          action={
            editor && (
              <Button asChild variant="primary">
                <Link href={`/sops/new${folder ? `?folder=${folder.id}` : ""}`}>
                  <Plus /> New SOP
                </Link>
              </Button>
            )
          }
        >
          {editor ? "Start from a template. Most SOPs take a few minutes to write." : "Ask the production team if you expected to see something."}
        </Empty>
      ) : (
        <ul className="overflow-hidden rounded-[12px] border border-line bg-surface" role="list">
          {sops.map((s) => (
            <li key={s.id} className="border-b border-line last:border-0">
              <Link href={`/sops/${s.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-wash-2 md:grid-cols-[96px_1fr_auto_auto]">
                <span className="order-2 font-mono text-xs text-muted md:order-none">{s.documentCode}</span>
                <span className="col-span-2 min-w-0 md:col-span-1">
                  <span className="block truncate text-[14px] text-fg-hi">{s.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{s.folderName}</span>
                    <span aria-hidden>·</span>
                    <span>{s.ownerName}</span>
                    {s.tags.slice(0, 3).map((t) => (
                      <span key={t} className="rounded-full border border-line px-1.5 leading-4 text-fg-2">
                        {t}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="order-3 hidden text-right text-xs text-muted md:block">
                  {s.versionNumber ? (
                    <>
                      <span className="font-mono">v{s.versionNumber}</span> · <LocalDate iso={s.effectiveAt} />
                    </>
                  ) : (
                    "Not published"
                  )}
                </span>
                <span className="order-4 flex items-center justify-end gap-1.5">
                  <ReviewBadge state={s.reviewState} className="hidden sm:inline-flex" />
                  {s.hasDraft && s.versionNumber && <StatusBadge status="draft" className="hidden sm:inline-flex" />}
                  <StatusBadge status={s.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-6 h-7 w-48 rounded bg-wash" />
      <div className="overflow-hidden rounded-[12px] border border-line">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-line px-4 py-4 last:border-0">
            <div className="h-4 w-20 rounded bg-wash-2" />
            <div className="h-4 flex-1 rounded bg-wash-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
