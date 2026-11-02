import { CABLE_STATUSES, CABLE_STATUS_LABEL, type CableStatus } from "./cabling";

/**
 * Turning a cable spreadsheet into cable-schedule rows. Columns are found by their headings, so the sheet's
 * layout can vary: "Area", "Name", "Cable", "Location From", "Location To", "Who", "Notes" (and optionally
 * "Cable ID", "Length", "Status"). Shared by the import dialog (preview) and the server (saving).
 */

export type CableRow = {
  label: string;
  name: string;
  type: string;
  from: string;
  to: string;
  room: string;
  who: string;
  notes: string;
  lengthFt: number | null;
  status: CableStatus | null;
};

type Field = keyof CableRow;

const HEADINGS: Record<Field, string[]> = {
  label: ["cable id", "id", "label", "tag", "cable number", "cable no", "number"],
  name: ["name", "description", "purpose", "device", "circuit", "run"],
  type: ["cable", "type", "cable type", "media"],
  from: ["location from", "from", "source", "start", "origin"],
  to: ["location to", "to", "destination", "end", "dest"],
  room: ["area", "room", "zone", "space", "location"],
  who: ["who", "installer", "assigned", "assigned to", "owner", "responsible", "contractor"],
  notes: ["notes", "note", "comments", "comment", "remarks"],
  lengthFt: ["length", "length ft", "length feet", "feet", "ft"],
  status: ["status", "state"],
};

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const clean = (s: string) => s.replace(/\s*\n+\s*/g, " ").replace(/\s+/g, " ").trim();

/** The heading row (one of the first 20 with at least two known headings) and which column holds each field. */
export function findColumns(rows: string[][]): { header: number; columns: Partial<Record<Field, number>> } | null {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const columns: Partial<Record<Field, number>> = {};
    rows[r].forEach((cell, c) => {
      const h = norm(cell);
      if (!h) return;
      const field = (Object.keys(HEADINGS) as Field[]).find((f) => columns[f] === undefined && HEADINGS[f].includes(h));
      if (field) columns[field] = c;
    });
    if (Object.keys(columns).length >= 2 && (columns.name !== undefined || columns.label !== undefined || columns.type !== undefined)) return { header: r, columns };
  }
  return null;
}

function statusOf(s: string): CableStatus | null {
  const v = norm(s);
  return CABLE_STATUSES.find((k) => k === v || norm(CABLE_STATUS_LABEL[k]) === v) ?? null;
}

/**
 * Spreadsheet rows → cables. Blank rows are skipped; an empty Area takes the one above it until a blank row,
 * as when a merged "Area" cell covers a group (a CSV export keeps only its first cell).
 */
export function cableRows(rows: string[][]): { rows: CableRow[]; skipped: number } | null {
  const found = findColumns(rows);
  if (!found) return null;
  const { header, columns } = found;
  const get = (row: string[], f: Field) => (columns[f] === undefined ? "" : clean(row[columns[f]!] ?? ""));
  const out: CableRow[] = [];
  let skipped = 0;
  let area = "";
  for (const row of rows.slice(header + 1)) {
    if (!row.some((v) => v.trim())) {
      area = "";
      continue;
    }
    const r: CableRow = {
      label: get(row, "label").slice(0, 40),
      name: get(row, "name").slice(0, 160),
      type: get(row, "type").slice(0, 80),
      from: get(row, "from").slice(0, 120),
      to: get(row, "to").slice(0, 120),
      room: (get(row, "room") || area).slice(0, 80),
      who: get(row, "who").slice(0, 80),
      notes: get(row, "notes").slice(0, 1_000),
      lengthFt: null,
      status: statusOf(get(row, "status")),
    };
    area = r.room;
    const len = parseFloat(get(row, "lengthFt").replace(/,/g, ""));
    if (Number.isFinite(len) && len >= 0) r.lengthFt = Math.min(100_000, len);
    if (!r.label && !r.name && !r.type) {
      skipped++;
      continue;
    }
    out.push(r);
  }
  return { rows: out, skipped };
}

/** ID prefix by cable type: NET-001, VID-001, … */
export function labelPrefix(type: string): string {
  const t = type.toLowerCase();
  if (/dmx/.test(t)) return "DMX";
  if (/fib(er|re)|\bom\d|\bos\d|single.?mode|multi.?mode/.test(t)) return "FIB";
  if (/cat ?\d|ethernet|network|rj-?45|utp|stp/.test(t)) return "NET";
  if (/4694|1694|sdi|coax|rg-?\d|bnc|hdmi|video/.test(t)) return "VID";
  if (/speaker|70 ?v|100 ?v/.test(t)) return "SPK";
  if (/9451|xlr|audio|mic|snake/.test(t)) return "AUD";
  if (/power|120 ?v|208 ?v|240 ?v|outlet|gang|electric/.test(t)) return "PWR";
  if (/conduit/.test(t)) return "CND";
  return "CBL";
}

type Matchable = Pick<CableRow, "label" | "room" | "name" | "from" | "to">;

/**
 * Which existing cable each spreadsheet row updates (its index in `existing`, or -1 for a new cable), so
 * re-importing an edited sheet updates cables instead of duplicating them. A cable ID wins. Otherwise a row
 * matches a cable with the same area and name, preferring the one with the same from and to (several rows
 * can share a name, like four "Wall Plate Control" runs), so a changed from or to still updates its cable.
 */
export function matchRows(existing: Matchable[], rows: Matchable[]): number[] {
  const used = new Set<number>();
  const byLabel = new Map(existing.map((c, i) => [c.label.toLowerCase(), i]));
  const key = (c: Matchable, full: boolean) => [c.room, c.name, ...(full ? [c.from, c.to] : [])].map(norm).join("|");
  const result = rows.map((r) => {
    const i = r.label ? byLabel.get(r.label.toLowerCase()) : undefined;
    if (i === undefined || used.has(i)) return -1;
    used.add(i);
    return i;
  });
  for (const full of [true, false]) {
    rows.forEach((r, ri) => {
      if (result[ri] !== -1 || (r.label && byLabel.has(r.label.toLowerCase()))) return;
      const k = key(r, full);
      const i = existing.findIndex((c, ci) => !used.has(ci) && key(c, full) === k);
      if (i >= 0) {
        used.add(i);
        result[ri] = i;
      }
    });
  }
  return result;
}
