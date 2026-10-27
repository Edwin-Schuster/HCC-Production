"use client";

import { ArrowDown, ArrowUp, Download, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  /** Value used to sort, search and export. Defaults to row[key]. */
  value?: (row: T) => string | number | null;
  /** Leave the column out of the CSV. */
  noCsv?: boolean;
  className?: string;
  align?: "right";
};

/** A sortable, searchable table with CSV export. Rows open with onRow (click or Enter on the first cell's button). */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  onRow,
  csv,
  search = true,
  empty,
  toolbar,
  label,
}: {
  rows: T[];
  columns: Column<T>[];
  onRow?: (row: T) => void;
  csv?: string;
  search?: boolean;
  empty: ReactNode;
  toolbar?: ReactNode;
  label: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const valueOf = (c: Column<T>, r: T) => (c.value ? c.value(r) : ((r as Record<string, unknown>)[c.key] as string | number | null));
  const query = q.trim().toLowerCase();
  let shown = query ? rows.filter((r) => columns.some((c) => String(valueOf(c, r) ?? "").toLowerCase().includes(query))) : rows;
  if (sort) {
    const col = columns.find((c) => c.key === sort.key)!;
    shown = [...shown].sort((a, b) => {
      const av = valueOf(col, a) ?? "";
      const bv = valueOf(col, b) ?? "";
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      return cmp * sort.dir;
    });
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      {(search || csv || toolbar) && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <label className="relative min-w-40 flex-1 sm:max-w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" aria-label={`Filter ${label}`} className="h-8 pl-8" />
            </label>
          )}
          {toolbar}
          <span className="flex-1" />
          {csv && (
            <Button size="sm" variant="ghost" onClick={() => downloadCsv(csv, [columns.filter((c) => !c.noCsv).map((c) => c.label), ...shown.map((r) => columns.filter((c) => !c.noCsv).map((c) => valueOf(c, r)))])}>
              <Download /> CSV
            </Button>
          )}
        </div>
      )}
      {rows.length ? (
        <div className="overflow-x-auto rounded-[12px] border border-line bg-surface">
          <table className="w-full min-w-[600px] text-[13px]" aria-label={label}>
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                {columns.map((c) => (
                  <th key={c.key} className={cn("px-3 py-2 font-normal", c.align === "right" && "text-right", c.className)} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                    {c.label && (
                      <button type="button" className="inline-flex items-center gap-1 hover:text-fg-hi" onClick={() => setSort({ key: c.key, dir: sort?.key === c.key ? (-sort.dir as 1 | -1) : 1 })}>
                        {c.label}
                        {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={cn("border-b border-line last:border-0", onRow && "cursor-pointer hover:bg-wash-2")} onClick={onRow && (() => onRow(r))}>
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn("px-3 py-2 text-fg-2", c.align === "right" && "text-right", c.className)}>
                      {i === 0 && onRow ? (
                        <button type="button" className="text-left font-[510] text-fg-hi" onClick={(e) => (e.stopPropagation(), onRow(r))}>
                          {c.render ? c.render(r) : String(valueOf(c, r) ?? "")}
                        </button>
                      ) : c.render ? (
                        c.render(r)
                      ) : (
                        String(valueOf(c, r) ?? "")
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-muted">
                    Nothing matches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-[12px] border border-dashed border-line px-6 py-8 text-center text-[13px] text-muted">{empty}</p>
      )}
    </div>
  );
}
