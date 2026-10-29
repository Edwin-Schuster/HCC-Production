import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, ChevronRight, FileClock, Flag } from "lucide-react";
import { SopBody } from "@/blocks/render";
import { outline, totalDuration } from "@/blocks/tree";
import { getContext } from "@/server/context";
import { AppError } from "@/server/errors";
import { listFolders } from "@/server/services/folders";
import { getSopDocument } from "@/server/services/sops";
import { getApprovalState } from "@/server/services/approvals";
import { ReviewPanel } from "@/components/sop/review-panel";
import { brandScope } from "@/server/services/branding";
import { ViewBeacon } from "@/components/sop/view-beacon";
import { StartRunButton } from "@/components/sop/start-run";
import { listThreads } from "@/server/services/comments";
import { listFeedback } from "@/server/services/feedback";
import { CommentsButton, DiscussionProvider, StepTools, type StepInfo } from "@/components/sop/discussion";
import { numberSteps, plain, walk } from "@/blocks/tree";
import { listMembers } from "@/server/services/workspace";
import { Empty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { MetaHeader } from "@/components/sop/meta-header";
import { SopActions } from "@/components/sop/sop-actions";
import { atLeast } from "@/server/permissions";
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
  const approvals = version.isDraft && doc.canEdit ? await getApprovalState(db, actor, sop.id) : null;
  const showApprovals = approvals && (approvals.required > 0 || approvals.decisions.length > 0 || approvals.reviewRequestedAt);

  // Comments and feedback for signed-in readers.
  const signedIn = Boolean(actor.userId);
  const [threads, openFeedback, people] = signedIn
    ? await Promise.all([listThreads(db, actor, sop.id), doc.canEdit ? listFeedback(db, actor, sop.id, { status: "open" }) : [], members.length ? members : listMembers(db, actor)])
    : [[], [], []];
  const feedbackCounts: Record<string, number> = {};
  for (const f of openFeedback) feedbackCounts[f.blockKey] = (feedbackCounts[f.blockKey] ?? 0) + 1;
  const numbers = numberSteps(doc.blocks);
  const steps: Record<string, StepInfo> = {};
  for (const { node } of walk(doc.blocks)) {
    if (node.type === "step") {
      const c = node.content;
      steps[node.key] = {
        label: `Step ${numbers.get(node.id)}: ${plain(c.title)}`,
        texts: { title: plain(c.title), description: c.description, expectedResult: c.expectedResult, warning: c.warning },
      };
    }
  }

  return (
    <DiscussionProvider
      sopId={sop.id}
      threads={threads}
      feedbackCounts={feedbackCounts}
      steps={steps}
      members={people.map((m) => ({ username: m.username, name: m.name }))}
      userId={actor.userId}
      canEdit={doc.canEdit}
      allowFeedback={signedIn && !version.isDraft && version.id === sop.currentVersionId}
    >
      <div className="mx-auto flex w-full max-w-[1120px] gap-12 px-[max(16px,env(safe-area-inset-left))] py-6 sm:px-8 sm:py-10">
        <article className="min-w-0 max-w-[740px] flex-1" {...brandScope(doc.branding)}>
        {!version.isDraft && !viewingOld && <ViewBeacon sopId={sop.id} />}
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

          {sop.status === "retired" && (
            <Banner tone="bad" icon={<AlertTriangle />}>
              This SOP is retired. Readers can't see it, and it can't be edited until it's restored{doc.canManage ? " (⋯ menu → Restore)" : ""}.
            </Banner>
          )}
          {version.isDraft && (
            <Banner tone="info" icon={<FileClock />}>
              You're previewing the <b className="font-[510] text-fg-hi">draft</b>. Readers{" "}
              {sop.currentVersionId ? (
                <>
                  still see{" "}
                  <Link className="underline underline-offset-2" href={`/sops/${sop.id}`}>
                    v{sop.versionNumber}
                  </Link>
                </>
              ) : (
                "can't see this SOP until it's published"
              )}
              .{" "}
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
          {openFeedback.length > 0 && (
            <Banner tone="warn" icon={<Flag />}>
              Readers flagged {openFeedback.length} problem{openFeedback.length === 1 ? "" : "s"} with this SOP.{" "}
              <Link href={`/sops/${sop.id}/feedback`} className="underline underline-offset-2">
                Review feedback
              </Link>
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
              <>
                {signedIn && !version.isDraft && !viewingOld && sop.status !== "retired" && <StartRunButton sopId={sop.id} compact />}
                {signedIn && <CommentsButton />}
                <SopActions
                  sopId={sop.id}
                  title={sop.title}
                  versionQuery={versionQuery}
                  canEdit={doc.canEdit}
                  canManage={doc.canManage}
                  canDelete={doc.canManage && (!sop.currentVersionId || atLeast(actor, "admin"))}
                  retired={sop.status === "retired"}
                  published={Boolean(sop.currentVersionId)}
                  isDraftView={version.isDraft}
                  meta={{ ownerId: sop.ownerId, folderId: sop.folderId, tags: sop.tags, reviewIntervalDays: sop.reviewIntervalDays, urlPatterns: sop.urlPatterns }}
                  members={members.map((m) => ({ id: m.id, name: m.name }))}
                  folders={folders.map((f) => ({ id: f.id, label: `${"  ".repeat(f.depth)}${f.name}` }))}
                />
              </>
            }
          />

          {showApprovals && (
            <ReviewPanel
              sopId={sop.id}
              state={approvals}
              compareHref={sop.currentVersionId ? `/sops/${sop.id}/compare?from=${sop.versionNumber}&to=draft` : null}
              lastEditorName={members.find((m) => m.id === approvals.lastEditorId)?.name ?? null}
            />
          )}

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
            {doc.blocks.length ? (
              <SopBody blocks={doc.blocks} roles={doc.roles} snippets={doc.snippets} slots={signedIn ? { actions: (step) => <StepTools blockKey={step.key} /> } : undefined} />
            ) : (
              <Empty title="This SOP is empty">{doc.canEdit ? "Open the editor and type / to add steps." : null}</Empty>
            )}
          </div>
          {doc.branding.footerText && <p className="mt-12 border-t border-line pt-4 text-xs text-muted">{doc.branding.footerText}</p>}
      </article>
        <aside className="sticky top-10 hidden max-h-[calc(100dvh-80px)] w-[220px] shrink-0 self-start overflow-y-auto xl:block">
          <Toc items={items} />
        </aside>
      </div>
    </DiscussionProvider>
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
