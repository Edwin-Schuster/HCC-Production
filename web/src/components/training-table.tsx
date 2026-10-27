import Link from "next/link";
import type { TrainingItem } from "@/server/services/training";
import { LocalDate } from "@/components/local-date";
import { Badge } from "@/components/ui/badge";

/** Assignments as rows. `who` shows the person (team view) or the SOP (my view). */
export function TrainingTable({ items, who }: { items: TrainingItem[]; who: "person" | "sop" | "both" }) {
  return (
    <ul role="list" className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
      {items.map((t) => (
        <li key={t.id}>
          <Link href={`/training/${t.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-wash-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] text-fg-hi">{who === "person" ? t.userName : t.sopTitle}</span>
              <span className="block text-xs text-muted">
                {who === "both" && `${t.userName} · `}
                {who !== "person" && <span className="font-mono">{t.documentCode} · </span>}
                {t.assignedByName ? `from ${t.assignedByName} · ` : ""}
                {t.dueAt ? (
                  <>
                    due <LocalDate iso={t.dueAt} />
                  </>
                ) : (
                  "no due date"
                )}
              </span>
            </span>
            {t.bestScore && (
              <span className="font-mono text-xs text-fg-2">
                {t.bestScore.score}/{t.bestScore.total}
              </span>
            )}
            {t.completedAt ? (
              <Badge tone="good">
                Done{t.completedVersion ? ` · v${t.completedVersion}` : ""}
                {t.completedVersion && t.currentVersion && t.currentVersion > t.completedVersion ? " (newer version out)" : ""}
              </Badge>
            ) : t.overdue ? (
              <Badge tone="bad">Overdue</Badge>
            ) : (
              <Badge>To do</Badge>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
