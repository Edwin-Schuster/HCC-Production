import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, ChevronRight, FileClock } from "lucide-react";
import { SopBody } from "@/blocks/render";
import { outline, totalDuration } from "@/blocks/tree";
import { getContext } from "@/server/context";
import { AppError } from "@/server/errors";
import { listFolders } from "@/server/services/folders";
import { getSopDocument } from "@/server/services/sops";
import { listMembers } from "@/server/services/workspace";
import { Empty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { MetaHeader } from "@/components/sop/meta-header";
import { SopActions } from "@/components/sop/sop-actions";
import { Toc } from "@/components/sop/toc";
import { LocalDate } from "@/components/local-date";

export const metadata: Metadata = { title: "SOP" };

export default function SopPage(props: PageProps<"/sops/[id]">) {
  return (
    <Suspense fallback={<DocSkeleton />}>
      <Reader params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Reader({ params, searchParams }: { params: PageProps<"/sops/[id]">["params"]; searchParams: PageProps<"/sops/[id]">["searchParams"] }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { db, actor } = await getContext();
  const want = sp.draft ? "draft" : typeof sp.v === "string" && /^\d+$/.test(sp.v) ? Number(sp.v) : undefined;
  let doc;
  try {
    doc = await getSopDocument(db, actor, id, want);
  } catch (e) {
    if (e instanceof AppError && e.status < 500) {
      return (
        <div className="mx-auto max-w-[720px] px-4 py-16">
          <Empty
            title="This SOP isn't available"
            action={
              <div className="flex justify-center gap-2">
                <Button asChild>
                  <Link href="/sops">All SOPs</Link>
                </Button>
                {!actor.userId && (
                  <Button asChild variant="primary">
                    <Link href={`/login?next=/sops/${id}`}>Sign in</Link>
                  </Button>
                )}
              </div>
            }
          >
            {e.message} It may have been retired, or it may only be visible to signed-in team members.
          </Empty>
        </div>
      );
    }
    throw e;
  }
  const { sop, version } = doc;
  const items = outline(doc.blocks);
  const minutes = totalDuration(doc.blocks);
  const viewingOld = !version.isDraft && version.id !== sop.currentVersionId;
  const versionQuery = version.isDraft ? (sop.currentVersionId ? "draft=1" : "") : viewingOld ? `v=${version.number}` : "";
  const [members, folders] = doc.canEdit ? await Promise.all([listMembers(db, actor), listFolders(db, actor)]) : [[], []];

  return (
    <div className="mx-auto flex w-full max-w-[1120px] gap-12 px-[max(16px,env(safe-area-inset-left))] py-6 sm:px-8 sm:py-10">
      <article className="min-w-0 max-w-[740px] flex-1">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-muted">
          <Link href="/sops" className="hover:text-fg-hi">
            SOPs
          </Link>
          <ChevronRight className="size-3" />
          <Link href={`/sops?folder=${sop.folderId}`} className="hover:text-fg-hi">
            {sop.folderName}
          </Link>
          <ChevronRight className="size-3" />
          <span className="font-mono text-fg-2">{sop.documentCode}</span>
        </nav>

        {sop.status === "retired" && <Banner tone="bad" icon={<AlertTriangle />}>This SOP is retired. Readers can't see it, and it can't be edited until it's restored.</Banner>}
        {version.isDraft && (
          <Banner tone="info" icon={<FileClock />}>
            You're previewing the <b className="font-[510] text-fg-hi">draft</b>. Readers {sop.currentVersionId ? <>still see <Link className="underline underline-offset-2" href={`/sops/${sop.id}`}>v{sop.versionNumber}</Link></> : "can't see this SOP until it's published"}.{" "}
            {doc.canEdit && (
              <Link href={`/sops/${sop.id}/edit`} className="underline underline-offset-2">
                Keep editing
              </Link>
            )}
          </Banner>
        )}
        {!version.isDraft && sop.hasDraft && doc.canEdit && !viewingOld && (
          <Banner tone="neutral" icon={<FileClock />}>
            There's an unpublished draft.{" "}
            <Link href={`/sops/${sop.id}?draft=1`} className="underline underline-offset-2">
              Preview it
            </Link>{" "}
            or{" "}
            <Link href={`/sops/${sop.id}/edit`} className="underline underline-offset-2">
              keep editing
            </Link>
            .
          </Banner>
        )}
        {viewingOld && (
          <Banner tone="warn" icon={<FileClock />}>
            You're viewing <b className="font-[510]">v{version.number}</b>, published <LocalDate iso={version.publishedAt} />. It has been replaced.{" "}
            <Link href={`/sops/${sop.id}`} className="underline underline-offset-2">
              Read the current version (v{sop.versionNumber})
            </Link>
          </Banner>
        )}

        <MetaHeader
          doc={doc}
          totalMinutes={minutes}
          actions={
            <SopActions
              sopId={sop.id}
              versionQuery={versionQuery}
              canEdit={doc.canEdit}
              canManage={doc.canManage}
              retired={sop.status === "retired"}
              published={Boolean(sop.currentVersionId)}
              isDraftView={version.isDraft}
              meta={{ ownerId: sop.ownerId, folderId: sop.folderId, tags: sop.tags, reviewIntervalDays: sop.reviewIntervalDays }}
              members={members.map((m) => ({ id: m.id, name: m.name }))}
              folders={folders.map((f) => ({ id: f.id, label: `${"  ".repeat(f.depth)}${f.name}` }))}
            />
          }
        />

        {!version.isDraft && version.changeSummary && (
          <p className="mt-4 text-[13px] text-muted">
            <span className="text-fg-2">What changed in v{version.number}:</span> {version.changeSummary}{" "}
            <Link href={`/sops/${sop.id}/history`} className="underline decoration-line-2 underline-offset-2 hover:text-fg-hi">
              All versions
            </Link>
          </p>
        )}

        {items.length > 2 && (
          <details className="mt-6 rounded-[12px] border border-line bg-surface px-4 py-3 xl:hidden">
            <summary className="cursor-pointer text-[13px] font-[510] text-fg-hi">On this page</summary>
            <Toc items={items} className="mt-3 [&>p]:hidden" />
          </details>
        )}

        <div className="mt-8">
          {doc.blocks.length ? <SopBody blocks={doc.blocks} roles={doc.roles} /> : <Empty title="This SOP is empty">{doc.canEdit ? "Open the editor and type / to add steps." : null}</Empty>}
        </div>
      </article>
      <aside className="sticky top-10 hidden max-h-[calc(100dvh-80px)] w-[220px] shrink-0 self-start overflow-y-auto xl:block">
        <Toc items={items} />
      </aside>
    </div>
  );
}

function Banner({ tone, icon, children }: { tone: "info" | "warn" | "bad" | "neutral"; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = { info: "border-iris/30 bg-info-soft", warn: "border-warn/30 bg-warn-soft", bad: "border-bad/30 bg-bad-soft", neutral: "border-line bg-surface" }[tone];
  return (
    <div className={`mb-5 flex items-start gap-2.5 rounded-[6px] border px-3.5 py-2.5 text-[13px] text-fg-2 [&>svg]:mt-[2px] [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted ${cls}`} role="status">
      {icon}
      <div>{children}</div>
    </div>
  );
}

function DocSkeleton() {
  return (
    <div className="mx-auto max-w-[740px] px-4 py-10 sm:px-8" aria-hidden>
      <div className="h-3 w-40 rounded bg-wash-2" />
      <div className="mt-5 h-8 w-3/4 rounded bg-wash" />
      <div className="mt-4 h-4 w-1/2 rounded bg-wash-2" />
      <div className="mt-6 h-20 rounded-[12px] border border-line bg-surface" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="mt-6 flex gap-3">
          <div className="size-6 rounded-full bg-wash" />
          <div className="h-4 flex-1 rounded bg-wash-2" />
        </div>
      ))}
    </div>
  );
}
