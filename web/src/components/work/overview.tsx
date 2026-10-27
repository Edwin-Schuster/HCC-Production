import type { ReactNode } from "react";
import { Ago } from "@/components/local-date";
import { Meter } from "@/components/work/badges";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/server/services/activity";

export function Stat({ label, value, sub, pct, tone }: { label: string; value: ReactNode; sub?: ReactNode; pct?: number; tone?: "bad" }) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] border border-line bg-surface p-4">
      <span className="text-xs text-muted">{label}</span>
      <span className={cn("text-[22px] font-[510] tracking-[-0.012em] text-fg-hi", tone === "bad" && "text-bad")}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
      {pct !== undefined && <Meter pct={pct} tone={tone === "bad" ? "bad" : "fg"} />}
    </div>
  );
}

export function ActivityList({ items, showTarget = true }: { items: ActivityItem[]; showTarget?: boolean }) {
  if (!items.length) return <p className="mt-2 text-[13px] text-muted">Nothing yet.</p>;
  return (
    <ul className="mt-2 grid gap-2" role="list">
      {items.map((a) => (
        <li key={a.id} className="flex gap-2.5 text-[13px]">
          <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-line-2" aria-hidden />
          <span className="min-w-0 text-fg-2">
            <b className="font-[510] text-fg-hi">{a.actorName ?? "Someone"}</b> {a.text}
            {showTarget && a.targetType !== "project" && <span className="text-muted"> · “{a.targetName}”</span>} <Ago iso={a.createdAt} className="text-xs text-faint" />
          </span>
        </li>
      ))}
    </ul>
  );
}
