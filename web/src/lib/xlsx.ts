import { strFromU8, unzipSync } from "fflate";

/**
 * Reads the cell text of every sheet in an Excel (.xlsx) file, including one downloaded from Google Sheets.
 * Merged cells repeat their value in every cell they cover. Values are the cached results Excel saved, so
 * formulas show what they last calculated. Works in the browser and on the server.
 */
export type Sheet = { name: string; rows: string[][] };

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITY[e] ?? m)));
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
/** All the text inside <t> elements (rich text runs included), in order. */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

/** "B12" → [row 11, column 1] (zero-based). */
function cellIndex(ref: string): [number, number] {
  const m = ref.match(/^([A-Z]+)(\d+)$/)!;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]) - 1, col - 1];
}

export function readXlsx(bytes: Uint8Array): Sheet[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("That isn't an Excel (.xlsx) file.");
  }
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : "");
  const workbook = read("xl/workbook.xml");
  if (!workbook) throw new Error("That isn't an Excel (.xlsx) file.");

  const targets = new Map<string, string>();
  for (const m of read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  }
  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));

  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(attr(m[0], "name") ?? "Sheet");
    const path = targets.get(attr(m[0], "r:id") ?? "");
    const xml = path ? read(path) : "";
    if (!xml) continue;
    const grid: string[][] = [];
    const set = (r: number, c: number, v: string) => {
      (grid[r] ??= [])[c] = v;
    };
    for (const cell of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cell[1], "r");
      if (!ref) continue;
      const type = attr(cell[1], "t");
      const body = cell[2] ?? "";
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const value = type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? texts(body) : type === "b" ? (v === "1" ? "TRUE" : "FALSE") : v !== undefined ? decode(v) : "";
      const [r, c] = cellIndex(ref);
      set(r, c, value);
    }
    for (const mc of xml.matchAll(/<mergeCell\b[^>]*ref="([A-Z]+\d+):([A-Z]+\d+)"/g)) {
      const [r0, c0] = cellIndex(mc[1]);
      const [r1, c1] = cellIndex(mc[2]);
      const value = grid[r0]?.[c0] ?? "";
      if (!value || (r1 - r0 + 1) * (c1 - c0 + 1) > 50_000) continue;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (!grid[r]?.[c]) set(r, c, value);
    }
    let width = 0; // rows the file leaves out are holes in grid, so don't spread it
    for (const row of grid) width = Math.max(width, row?.length ?? 0);
    sheets.push({ name, rows: Array.from(grid, (row) => Array.from({ length: width }, (_, c) => (row?.[c] ?? "").trim())) });
  }
  return sheets;
}

/** Comma-separated values (RFC 4180: quoted fields may hold commas, quotes and line breaks). */
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      (row = []), (field = "");
    } else field += ch;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.map((r) => r.map((v) => v.trim()));
}
