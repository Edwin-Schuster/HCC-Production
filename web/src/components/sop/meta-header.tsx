import type { ReactNode } from "react";
import type { SopDocument } from "@/server/services/sops";
import { LocalDate } from "@/components/local-date";
import { StatusBadge } from "./status";
import { formatMinutes } from "@/blocks/tree";

/**
 * Title block. Shared by the reading view and the PDF so they match. The document-control grid (code,
 * version, owner, dates, status) is for printed copies and PDFs only; on screen, only a review that needs
 * doing and the total time are shown, next to the folder.
 */
export function MetaHeader({ doc, totalMinutes, actions, print }: { doc: SopDocument; totalMinutes: number; actions?: ReactNode; print?: boolean }) {
  const { sop, version } = doc;
  const status = version.isDraft ? "draft" : sop.status;
  const items: [string, ReactNode][] = [
    ["Document", <span key="c" className="font-mono">{sop.documentCode}</span>],
    ["Version", version.isDraft ? <span key="v">Draft{sop.versionNumber ? <span className="text-muted"> (after v{sop.versionNumber})</span> : null}</span> : <span key="v" className="font-mono">v{version.number}</span>],
    ["Owner", sop.ownerName],
    ["Effective", version.isDraft ? "Not published" : <LocalDate key="e" iso={version.publishedAt} />],
    ["Status", <StatusBadge key="s" status={status} />],
  ];
  if (totalMinutes) items.push(["Time", <span key="t" className="font-mono">{formatMinutes(totalMinutes)}</span>]);
  return (
    <header className={`sop-header break-inside-avoid border-b border-line ${print ? "pb-6" : "pb-5"}`}>
      {(doc.branding.logoUrl || doc.branding.headerText) && (
        <div className="mb-4 flex items-center gap-3">
          {doc.branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- workspace logo upload
            <img src={doc.branding.logoUrl} alt="" className="h-7 w-auto max-w-[160px] object-contain" />
          )}
          {doc.branding.headerText && <span className="text-xs font-[510] uppercase tracking-[0.06em] text-muted">{doc.branding.headerText}</span>}
        </div>
      )}
      {print ? (
        <>
          <p className="mb-2 text-xs text-muted">{sop.folderName}</p>
          <h1 className="text-[28px] font-[510] leading-[1.15] tracking-[-0.022em] text-fg-hi">{version.title}</h1>
          {version.summary && <p className="mt-3 max-w-[62ch] text-[16px] leading-relaxed text-muted">{version.summary}</p>}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <h1 className="min-w-0 text-[26px] font-[510] leading-[1.15] tracking-[-0.022em] text-fg-hi sm:text-[30px]">{version.title}</h1>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-0.5 print:hidden">{actions}</div>}
          </div>
          {(sop.tags.length > 0 || totalMinutes > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {totalMinutes > 0 && <span className="font-mono">{formatMinutes(totalMinutes)}</span>}
              {sop.tags.map((t) => (
                <span key={t} className="rounded-full border border-line px-1.5 leading-4 text-fg-2">
                  {t}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      <dl className={`mt-5 grid-cols-4 gap-x-6 gap-y-3 rounded-[12px] border border-line bg-surface px-4 py-3.5 ${print ? "grid" : "hidden print:grid"}`}>
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
