/** CSV for spreadsheets. Cells starting with = + - @ are prefixed with ' so they can't run as formulas. */
export function toCsv(rows: unknown[][]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export const slug = (s: string) => s.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "export";

/** Browser only: saves rows as a .csv file. */
export function downloadCsv(filename: string, rows: unknown[][]) {
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
