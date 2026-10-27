"use client";

import Link from "next/link";
import { useState } from "react";
import { addDays, daysBetween } from "@/lib/work";
import { cn } from "@/lib/utils";

export type GanttRow = { id: string; name: string; start: string; end: string; color: string; done?: boolean; depth?: number; href?: string; onOpen?: () => void };

const fmtMonth = (d: string) => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const fmtShort = (d: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

/** A horizontal timeline. Scrolls sideways inside its box; the names column stays put. */
export function Gantt({ rows, today, label = "Timeline" }: { rows: GanttRow[]; today: string; label?: string }) {
  const [zoom, setZoom] = useState<"day" | "week">(rows.length && daysBetween(rows.reduce((a, r) => (r.start < a ? r.start : a), rows[0].start), rows.reduce((a, r) => (r.end > a ? r.end : a), rows[0].end)) > 90 ? "week" : "day");
  if (!rows.length) return null;
  const dw = zoom === "week" ? 9 : 30;
  let min = rows.reduce((a, r) => (r.start < a ? r.start : a), rows[0].start);
  let max = rows.reduce((a, r) => (r.end > a ? r.end : a), rows[0].end);
  if (today < min) min = today;
  if (today > max) max = today;
  min = addDays(min, -3);
  max = addDays(max, 7);
  const span = daysBetween(min, max) + 1;
  const days = Array.from({ length: span }, (_, i) => addDays(min, i));
  const starts = days.map((d, i) => [i, d] as const).filter(([i, d]) => i === 0 || d.endsWith("-01"));
  // Drop the first (partial) month's label if the next month starts too close to fit it.
  const months = starts.length > 1 && starts[1][0] * dw < 120 ? starts.slice(1) : starts;
  const ticks = days.map((d, i) => [i, d] as const).filter(([, d]) => zoom === "day" || dow(d) === 0);
  const rowH = 32;

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <div className="inline-flex rounded-[6px] border border-line p-0.5" role="group" aria-label="Zoom">
          {(["day", "week"] as const).map((z) => (
            <button key={z} type="button" onClick={() => setZoom(z)} aria-pressed={zoom === z} className={cn("rounded-[4px] px-2 py-0.5 text-xs", zoom === z ? "bg-wash text-fg-hi" : "text-muted hover:text-fg-hi")}>
              {z === "day" ? "Days" : "Weeks"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex overflow-hidden rounded-[12px] border border-line bg-surface" role="figure" aria-label={label}>
        <div className="w-[38%] max-w-[220px] shrink-0 border-r border-line">
          <div className="h-[44px] border-b border-line" />
          {rows.map((r) => (
            <RowName key={r.id} row={r} height={rowH} />
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width: span * dw }}>
            <div className="relative h-[22px] text-[11px] text-muted">
              {months.map(([i, d]) => (
                <span key={d} className="absolute top-1 whitespace-nowrap pl-1.5" style={{ left: i * dw }}>
                  {fmtMonth(d)}
                </span>
              ))}
            </div>
            <div className="relative h-[22px] border-b border-line font-mono text-[10px] text-faint">
              {ticks.map(([i, d]) => (
                <span key={d} className={cn("absolute top-0.5 text-center", (dow(d) === 0 || dow(d) === 6) && zoom === "day" && "text-muted")} style={{ left: i * dw, width: zoom === "day" ? dw : undefined }}>
                  {zoom === "day" ? Number(d.slice(8)) : fmtShort(d)}
                </span>
              ))}
            </div>
            {rows.map((r) => {
              const x = daysBetween(min, r.start) * dw;
              const w = Math.max(dw, (daysBetween(r.start, r.end) + 1) * dw);
              const bar = (
                <span
                  className={cn("absolute top-1.5 flex h-5 items-center overflow-hidden whitespace-nowrap rounded-[4px] px-1.5 text-[11px] text-black/80", r.done && "opacity-50")}
                  style={{ left: x, width: w, background: r.color }}
                  title={`${r.name}: ${fmtShort(r.start)} – ${fmtShort(r.end)}`}
                >
                  {w > 60 ? r.name : ""}
                </span>
              );
              return (
                <div key={r.id} className="relative border-b border-line/60 last:border-0" style={{ height: rowH }}>
                  {r.href ? (
                    <Link href={r.href} aria-hidden tabIndex={-1}>
                      {bar}
                    </Link>
                  ) : r.onOpen ? (
                    <button type="button" onClick={r.onOpen} aria-hidden tabIndex={-1}>
                      {bar}
                    </button>
                  ) : (
                    bar
                  )}
                </div>
              );
            })}
            <div className="pointer-events-none absolute bottom-0 top-[44px] w-px bg-bad/70" style={{ left: daysBetween(min, today) * dw + dw / 2 }} title="Today" />
          </div>
        </div>
      </div>
    </div>
  );
}

function RowName({ row, height }: { row: GanttRow; height: number }) {
  const cls = "flex w-full items-center truncate border-b border-line/60 px-3 text-left text-[13px] text-fg-2 last:border-0 hover:bg-wash-2 hover:text-fg-hi";
  const style = { height, paddingLeft: 12 + (row.depth ?? 0) * 14 };
  if (row.href)
    return (
      <Link href={row.href} className={cls} style={style}>
        <span className="truncate">{row.name}</span>
      </Link>
    );
  return (
    <button type="button" onClick={row.onOpen} className={cls} style={style}>
      <span className="truncate">{row.name}</span>
    </button>
  );
}
