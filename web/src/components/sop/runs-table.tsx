import Link from "next/link";
import type { RunSummary } from "@/server/services/runs";
import { LocalDate } from "@/components/local-date";
import { Badge } from "@/components/ui/badge";

const STATUS = { in_progress: ["In progress", "info"], completed: ["Completed", "good"], abandoned: ["Abandoned", "neutral"] } as const;

export function RunsTable({ runs, showSop }: { runs: RunSummary[]; showSop?: boolean }) {
  return (
    <ul role="list" className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
      {runs.map((r) => {
        const [label, tone] = STATUS[r.status];
        const mins = r.completedAt ? Math.round((Date.parse(r.completedAt) - Date.parse(r.startedAt)) / 60000) : null;
        return (
          <li key={r.id}>
            <Link href={`/runs/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-wash-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-fg-hi">
                  {showSop ? r.sopTitle : r.label || "Run"}
                  {showSop && r.label && <span className="text-muted"> · {r.label}</span>}
                </span>
                <span className="block text-xs text-muted">
                  {showSop && <span className="font-mono">{r.documentCode} · </span>}v{r.versionNumber} · {r.startedByName} · <LocalDate iso={r.startedAt} withTime />
                </span>
              </span>
              <span className="font-mono text-xs text-muted">
                {r.done} done{r.skipped ? ` · ${r.skipped} skipped` : ""}
                {mins !== null && ` · ${mins} min`}
              </span>
              <Badge tone={tone}>{label}</Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
