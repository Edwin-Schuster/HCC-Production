import { cableRows, type CableRow } from "./cable-import";
import { vendorFromUrl } from "./purchasing";
import type { Sheet } from "./xlsx";

/**
 * Reading a project workbook (one tab per part of the project) into what the app tracks:
 *
 * - A budget summary tab ("Total"): category rows with a Budgeted amount, grouped under who pays (a row with
 *   just a name, like "EKO" or "HCC"). Total rows are skipped; actuals are worked out by the app.
 * - Item tabs ("Lighting", "Video", …): section titles followed by an Item / QTY / Price Per table. Each tab
 *   is a budget category; each title is a section.
 * - A cable schedule tab (see cable-import.ts).
 * - A network tab: Connection / VLAN / Reserved IP / Device Name / MAC Address / Notes. A switch ends when
 *   the port numbers start again at 1; Wi-Fi rows become their own group.
 *
 * Shared by the import dialog (preview) and tests; the server validates what it's sent.
 */

export type BudgetRow = { category: string; source: string; budget: number };
export type ItemRow = { category: string; section: string; item: string; qty: number; unitCost: number; url: string; vendor: string };
export type PortRow = { switchName: string; port: string; vlan: string; ip: string; device: string; mac: string; length: string; notes: string };

export type TabKind = "budget" | "items" | "cables" | "network" | "skipped";
export type Workbook = {
  tabs: { name: string; kind: TabKind; count: number }[];
  budget: BudgetRow[];
  items: ItemRow[];
  /** Every tab that reads as a cable schedule; the newest-looking one is used unless the person picks. */
  cableTabs: { name: string; rows: CableRow[] }[];
  ports: PortRow[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const num = (s: string) => {
  const n = parseFloat(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const filled = (row: string[]) => row.filter((c) => c.trim() !== "");
const isTotal = (s: string) => /^(sub)?total\b/i.test(s.trim());

function findHeader(rows: string[][], test: (cells: string[]) => boolean, limit = rows.length): number {
  for (let r = 0; r < Math.min(rows.length, limit); r++) if (test(rows[r].map(norm))) return r;
  return -1;
}
const col = (header: string[], ...names: string[]) => header.findIndex((h) => names.includes(norm(h)));

/** Budget summary: label in the first column, the "Budget(ed)" column for amounts. */
function readBudget(rows: string[][]): BudgetRow[] | null {
  const h = findHeader(rows, (c) => c.some((x) => /^budget(ed)?$/.test(x)), 10);
  if (h < 0) return null;
  const amount = rows[h].findIndex((c) => /^budget(ed)?$/i.test(c.trim()));
  const label = rows[h].findIndex((c, i) => i < amount && c.trim() !== "");
  const lc = label < 0 ? 0 : label;
  const out: BudgetRow[] = [];
  let source = label >= 0 ? clean(rows[h][label]) : "";
  const body = rows.slice(h + 1).filter((r) => filled(r).length);
  body.forEach((r, i) => {
    const name = clean(r[lc] ?? "");
    if (!name || isTotal(name)) return;
    const value = num(r[amount] ?? "");
    const onlyName = filled(r).length === 1;
    if (onlyName) {
      // A name on its own heads a group when budget rows follow it; otherwise it's a category without an amount yet.
      const next = body[i + 1];
      if (next && !isTotal(clean(next[lc] ?? "")) && num(next[amount] ?? "") !== null) {
        source = name;
        return;
      }
    }
    out.push({ category: name.slice(0, 60), source: source.slice(0, 60), budget: value ?? 0 });
  });
  return out.length ? out : null;
}

/** Item tab: section titles and Item / QTY / Price Per tables. */
function readItems(name: string, rows: string[][]): ItemRow[] | null {
  if (findHeader(rows, (c) => c.includes("item") && c.some((x) => /^(qty|quantity)$/.test(x))) < 0) return null;
  const out: ItemRow[] = [];
  let section = "";
  let cols: { item: number; qty: number; price: number; link: number; vendor: number } | null = null;
  for (const r of rows) {
    const cells = r.map(norm);
    if (cells.includes("item") && cells.some((x) => /^(qty|quantity)$/.test(x))) {
      cols = { item: col(r, "item", "description"), qty: col(r, "qty", "quantity"), price: col(r, "price per", "price", "unit price", "unit cost", "cost", "each"), link: col(r, "vendor link", "link", "url"), vendor: col(r, "vendor") };
      continue;
    }
    const f = filled(r);
    if (!f.length) continue;
    const first = clean(r.find((c) => c.trim()) ?? "");
    // A title on its own (a merged title cell repeats its text across the row).
    if (new Set(f.map(clean)).size === 1 && Number.isNaN(Number(first.replace(/[$,]/g, "")))) {
      if (!isTotal(first)) section = first.slice(0, 120);
      cols = null;
      continue;
    }
    if (!cols || cols.item < 0) continue;
    const item = clean(r[cols.item] ?? "");
    if (!item || isTotal(item)) continue;
    const qty = cols.qty >= 0 ? (num(r[cols.qty] ?? "") ?? 1) : 1;
    const unitCost = cols.price >= 0 ? (num(r[cols.price] ?? "") ?? 0) : 0;
    const linkCell = [cols.link, cols.vendor].filter((c) => c >= 0).map((c) => r[c]?.trim() ?? "");
    const url = linkCell.find((v) => /^https?:\/\//i.test(v)) ?? "";
    const vendorText = linkCell.find((v) => v && !/^https?:\/\//i.test(v)) ?? "";
    out.push({ category: name.slice(0, 60), section, item: item.slice(0, 200), qty: Math.max(0, qty), unitCost: Math.max(0, unitCost), url: url.slice(0, 2_000), vendor: (vendorText || vendorFromUrl(url)).slice(0, 120) });
  }
  return out;
}

/** Network tab: ports per switch, Wi-Fi devices on their own. */
function readNetwork(rows: string[][]): PortRow[] | null {
  const h = findHeader(rows, (c) => c.includes("vlan") && c.some((x) => /^(device|device name|connection|port)$/.test(x)), 10);
  if (h < 0) return null;
  const hd = rows[h];
  const c = { conn: col(hd, "connection", "port", "interface"), vlan: col(hd, "vlan"), ip: col(hd, "reserved ip", "ip", "ip address", "address"), length: col(hd, "length"), device: col(hd, "device name", "device"), mac: col(hd, "mac address", "mac"), notes: col(hd, "notes", "note") };
  const get = (r: string[], i: number) => (i >= 0 ? clean(r[i] ?? "") : "");
  const raw: (PortRow & { n: number | null; wifi: boolean })[] = [];
  for (const r of rows.slice(h + 1)) {
    if (!filled(r).length) continue;
    const conn = get(r, c.conn);
    const wifi = /^(wi-?fi|wireless)$/i.test(conn);
    const n = Number(conn.match(/(\d+)\s*$/)?.[1] ?? NaN);
    const vlan = get(r, c.vlan);
    // A VLAN label merged across the row repeats in every column it covers; it belongs in VLAN only.
    const own = (i: number) => (get(r, i) === vlan ? "" : get(r, i));
    raw.push({ switchName: "", port: wifi ? "" : conn.slice(0, 40), vlan: vlan.slice(0, 80), ip: own(c.ip).slice(0, 60), device: own(c.device).slice(0, 160), mac: own(c.mac).slice(0, 40), length: own(c.length).slice(0, 40), notes: own(c.notes).slice(0, 1_000), n: Number.isFinite(n) ? n : null, wifi });
  }
  // Split wired rows into switches where the port number starts over.
  const groups: (typeof raw)[] = [];
  let last = Infinity;
  for (const r of raw.filter((x) => !x.wifi)) {
    if (!groups.length || (r.n !== null && r.n <= last)) groups.push([]);
    groups[groups.length - 1].push(r);
    if (r.n !== null) last = r.n;
  }
  const out: PortRow[] = [];
  groups.forEach((g, i) => {
    const name = `Switch ${i + 1} (${g.length}-port)`;
    for (const { n: _n, wifi: _w, ...p } of g) out.push({ ...p, switchName: name });
  });
  for (const { n: _n, wifi: _w, ...p } of raw.filter((x) => x.wifi)) out.push({ ...p, switchName: "Wi-Fi" });
  return out.length ? out : null;
}

export function readWorkbook(sheets: Sheet[]): Workbook {
  const wb: Workbook = { tabs: [], budget: [], items: [], cableTabs: [], ports: [] };
  for (const sh of sheets) {
    const budget = !wb.budget.length ? readBudget(sh.rows) : null;
    if (budget) {
      wb.budget = budget;
      wb.tabs.push({ name: sh.name, kind: "budget", count: budget.length });
      continue;
    }
    const ports = readNetwork(sh.rows);
    if (ports) {
      wb.ports.push(...ports);
      wb.tabs.push({ name: sh.name, kind: "network", count: ports.length });
      continue;
    }
    const cables = cableRows(sh.rows);
    if (cables && cables.rows.length && !readItems(sh.name, sh.rows)) {
      wb.cableTabs.push({ name: sh.name, rows: cables.rows });
      wb.tabs.push({ name: sh.name, kind: "cables", count: cables.rows.length });
      continue;
    }
    const items = readItems(sh.name, sh.rows);
    if (items) {
      wb.items.push(...items);
      wb.tabs.push({ name: sh.name, kind: "items", count: items.length });
      continue;
    }
    wb.tabs.push({ name: sh.name, kind: "skipped", count: 0 });
  }
  return wb;
}

/** The cable tab to use by default: the last one whose name mentions cables (e.g. "V2 Revised" after "V1"). */
export function defaultCableTab(wb: Workbook): number {
  for (let i = wb.cableTabs.length - 1; i >= 0; i--) if (/cabl/i.test(wb.cableTabs[i].name)) return i;
  return wb.cableTabs.length - 1;
}

/** Budget groups whose categories have no item tab are contractor work (e.g. the integrator's contract). */
export function contractorGroups(wb: Workbook): string[] {
  const withItems = new Set(wb.items.map((i) => i.category.toLowerCase()));
  const sources = [...new Set(wb.budget.map((b) => b.source).filter(Boolean))];
  return sources.filter((s) => !wb.budget.some((b) => b.source === s && withItems.has(b.category.toLowerCase())));
}
