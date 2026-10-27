import Link from "next/link";
import type { AuditItem } from "@/server/services/audit";
import { LocalDate } from "@/components/local-date";

const VERB: Record<string, string> = {
  "sop.created": "created",
  "sop.published": "published",
  "sop.metadata_updated": "changed the details of",
  "sop.retired": "retired",
  "sop.restored": "restored",
  "sop.deleted": "deleted",
  "sop.draft_discarded": "discarded the draft of",
  "sop.snippet_updated": "updated a snippet used in",
  "sop.review_requested": "asked for a review of",
  "sop.approved": "approved",
  "sop.changes_requested": "asked for changes to",
  "sop.reviewed": "marked as reviewed",
  "sop.rolled_back": "restored an old version of",
  "sop.suggestion_accepted": "accepted a suggestion on",
  "sop.imported": "imported",
  "sop.shared": "created a share link for",
  "sop.share_revoked": "revoked a share link for",
  "snippet.created": "created the snippet",
  "snippet.updated": "updated the snippet",
  "snippet.deleted": "deleted the snippet",
  "folder.created": "created the folder",
  "folder.updated": "changed the folder",
  "folder.deleted": "deleted the folder",
  "workspace.branding_updated": "changed the branding",
  "apikey.created": "created an API key",
  "apikey.revoked": "revoked an API key",
  "webhook.created": "added a webhook",
  "webhook.deleted": "removed a webhook",
};

/** A short, readable detail from the event's metadata. */
function detail(e: AuditItem): string | null {
  const m = e.metadata;
  if (e.action === "sop.published") return `v${m.versionNumber}: ${m.changeSummary}`;
  if (e.action === "sop.snippet_updated") return `${m.snippetName} v${m.snippetVersion}`;
  if (e.action === "sop.rolled_back") return `from v${m.fromVersion}`;
  if (typeof m.comment === "string" && m.comment) return m.comment;
  if (typeof m.note === "string" && m.note) return m.note;
  if (e.action === "sop.metadata_updated" && m.changes) return Object.keys(m.changes as object).join(", ");
  return null;
}

export function AuditList({ items }: { items: AuditItem[] }) {
  return (
    <ol role="list" className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
      {items.map((e) => {
        const d = detail(e);
        const href = e.targetType === "sop" && e.action !== "sop.deleted" ? `/sops/${e.targetId}` : e.targetType === "snippet" && e.action !== "snippet.deleted" ? `/snippets/${e.targetId}` : null;
        return (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2.5 text-[13.5px]">
            <span className="w-36 shrink-0 text-xs text-faint">
              <LocalDate iso={e.createdAt} withTime />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-[510] text-fg-hi">{e.actorName ?? "System"}</span> <span className="text-muted">{VERB[e.action] ?? e.action}</span>{" "}
              {e.targetLabel && (href ? <Link href={href} className="text-fg-2 hover:underline">{e.targetLabel}</Link> : <span className="text-fg-2">{e.targetLabel}</span>)}
              {d && <span className="block truncate text-xs text-muted">{d}</span>}
            </span>
            <span className="font-mono text-[11px] text-faint">{e.action}</span>
          </li>
        );
      })}
    </ol>
  );
}
