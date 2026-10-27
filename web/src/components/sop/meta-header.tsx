import type { ReactNode } from "react";
import type { SopDocument } from "@/server/services/sops";
import { LocalDate } from "@/components/local-date";
import { ReviewBadge, StatusBadge } from "./status";
import { formatMinutes } from "@/blocks/tree";

/** Title block + metadata grid. Shared by the reading view and the PDF so they match. */
export function MetaHeader({ doc, totalMinutes, actions, print }: { doc: SopDocument; totalMinutes: number; actions?: ReactNode; print?: boolean }) {
  const { sop, version } = doc;
  const status = version.isDraft ? "draft" : sop.status;
  const items: [string, ReactNode][] = [
    ["Document", <span key="c" className="font-mono">{sop.documentCode}</span>],
    ["Version", version.isDraft ? <span key="v">Draft{sop.versionNumber ? <span className="text-muted"> (after v{sop.versionNumber})</span> : null}</span> : <span key="v" className="font-mono">v{version.number}</span>],
    ["Owner", sop.ownerName],
    ["Effective", version.isDraft ? "Not published" : <LocalDate key="e" iso={version.publishedAt} />],
    [
      "Next review",
      <span key="r" className="inline-flex items-center gap-1.5">
        <LocalDate iso={sop.nextReviewAt} />
        {!print && <ReviewBadge state={sop.reviewState} />}
      </span>,
    ],
    ["Status", <StatusBadge key="s" status={status} />],
  ];
  if (totalMinutes) items.push(["Time", <span key="t" className="font-mono">{formatMinutes(totalMinutes)}</span>]);
  return (
    <header className="sop-header break-inside-avoid border-b border-line pb-6">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span>{sop.folderName}</span>
        {sop.tags.length > 0 && <span aria-hidden>·</span>}
        {sop.tags.map((t) => (
          <span key={t} className="rounded-full border border-line px-1.5 leading-4 text-fg-2">
            {t}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className={print ? "text-[28px] font-[510] leading-[1.15] tracking-[-0.022em] text-fg-hi" : "text-[28px] font-[510] leading-[1.13] tracking-[-0.022em] text-fg-hi sm:text-[34px]"}>
          {version.title}
        </h1>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5 print:hidden">{actions}</div>}
      </div>
      {version.summary && <p className="mt-3 max-w-[62ch] text-[16px] leading-relaxed text-muted">{version.summary}</p>}
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-[12px] border border-line bg-surface px-4 py-3.5 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4">
        {items.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="mt-0.5 truncate text-[13.5px] text-fg-hi">{v}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
