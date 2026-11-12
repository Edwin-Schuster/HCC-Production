import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { bomItems, budgetLines, invoices, projects, purchaseOrders, scopesOfWork, type Attachment, type PoLine } from "@/db/schema";
import { BOM_STATUSES, BOM_STATUS_LABEL, INVOICE_STATUSES, PO_STATUSES, PO_STATUS_LABEL, SOW_STATUSES, budgetFor, deriveStatus, lineReceived, lineTotal, type BomStatus, type InvoiceStatus, type PoStatus, type SowStatus } from "@/lib/purchasing";
import { invalid, notFound } from "@/server/errors";
import type { Actor } from "@/server/permissions";
import { describeChanges, logActivity } from "./activity";
import { Day, loadProject, requireEditor } from "./projects";
import { emit } from "./webhooks";
import { Attachments } from "./files";

/** Bills of materials, purchase orders and the budget they roll up into. Editors only. */

const pick = <T extends string>(all: readonly T[], v: string, fallback: T): T => ((all as readonly string[]).includes(v) ? (v as T) : fallback);
const Money = z.number().min(0).max(100_000_000);
const cents = (dollars: number) => Math.round(dollars * 100);
const fmt = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

// ---------- Bill of materials ----------

export type BomItem = { id: string; projectId: string; item: string; partNumber: string; vendor: string; category: string; section: string; url: string; qty: number; unitCostCents: number; status: BomStatus };
const toBom = (b: typeof bomItems.$inferSelect): BomItem => ({ id: b.id, projectId: b.projectId, item: b.item, partNumber: b.partNumber, vendor: b.vendor, category: b.category, section: b.section, url: b.url, qty: b.qty, unitCostCents: b.unitCostCents, status: pick(BOM_STATUSES, b.status, "needed") });

/** Links people can open: http(s) only. */
const WebLink = z
  .string()
  .trim()
  .max(2_000)
  .refine((u) => !u || /^https?:\/\/\S+$/i.test(u), "Links must start with http:// or https://")
  .default("");

export const BomInput = z.object({
  item: z.string().trim().min(1, "Name the item").max(200),
  partNumber: z.string().trim().max(80).default(""),
  vendor: z.string().trim().max(120).default(""),
  category: z.string().trim().min(1).max(60).default("Other"),
  section: z.string().trim().max(120).default(""),
  url: WebLink,
  qty: z.number().min(0).max(1_000_000).default(1),
  /** Dollars. */
  unitCost: Money.default(0),
  status: z.enum(BOM_STATUSES).default("needed"),
});

export async function listBom(db: Executor, actor: Actor, projectId: string) {
  await loadProject(db, actor, projectId);
  return (await db.select().from(bomItems).where(eq(bomItems.projectId, projectId)).orderBy(asc(bomItems.position), asc(bomItems.createdAt), asc(bomItems.item))).map(toBom);
}

async function loadBom(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "purchasing");
  const [b] = await db.select().from(bomItems).where(and(eq(bomItems.id, id), eq(bomItems.workspaceId, actor.workspaceId))).limit(1);
  if (!b) throw notFound("BOM item not found.");
  return b;
}

export async function createBomItem(db: Executor, actor: Actor, projectId: string, input: z.input<typeof BomInput>) {
  const project = await loadProject(db, actor, projectId);
  const { unitCost, ...data } = BomInput.parse(input);
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${bomItems.position}), -1)::int + 1` }).from(bomItems).where(eq(bomItems.projectId, project.id));
  const [row] = await db.insert(bomItems).values({ workspaceId: actor.workspaceId, projectId: project.id, ...data, unitCostCents: cents(unitCost), position: next }).returning();
  await logActivity(db, actor, { projectId: project.id, targetType: "bom", targetId: row.id, targetName: row.item, text: "added this to the bill of materials" });
  return toBom(row);
}

const BOM_LABELS = { item: "item", qty: "quantity", unitCostCents: "unit cost", status: "status", vendor: "vendor" };

export async function updateBomItem(db: Executor, actor: Actor, id: string, input: z.input<typeof BomInput>) {
  const before = await loadBom(db, actor, id);
  const { unitCost, ...data } = BomInput.parse(input);
  const next = { ...data, unitCostCents: cents(unitCost) };
  const [row] = await db.update(bomItems).set({ ...next, updatedAt: new Date() }).where(eq(bomItems.id, id)).returning();
  const text = describeChanges(before, next, BOM_LABELS, (k, v) => (k === "status" ? BOM_STATUS_LABEL[pick(BOM_STATUSES, String(v), "needed")] : k === "unitCostCents" ? fmt(Number(v)) : String(v))).join(", ");
  await logActivity(db, actor, { projectId: row.projectId, targetType: "bom", targetId: id, targetName: row.item, text });
  return toBom(row);
}

export async function deleteBomItem(db: Executor, actor: Actor, id: string) {
  const b = await loadBom(db, actor, id);
  await db.delete(bomItems).where(eq(bomItems.id, id));
  await logActivity(db, actor, { projectId: b.projectId, targetType: "project", targetId: b.projectId, targetName: b.item, text: `removed “${b.item}” from the bill of materials` });
}

// ---------- Purchase orders ----------

export type PurchaseOrder = {
  id: string;
  projectId: string;
  projectName: string;
  poNumber: string;
  vendor: string;
  date: string | null;
  status: PoStatus;
  category: string;
  notes: string;
  lines: PoLine[];
  receivedDate: string | null;
  attachments: Attachment[];
  totalCents: number;
  receivedCents: number;
};

const toPo = (p: typeof purchaseOrders.$inferSelect, projectName: string): PurchaseOrder => ({
  id: p.id,
  projectId: p.projectId,
  projectName,
  poNumber: p.poNumber,
  vendor: p.vendor,
  date: p.date,
  status: pick(PO_STATUSES, p.status, "draft"),
  category: p.category,
  notes: p.notes,
  lines: p.lines,
  receivedDate: p.receivedDate,
  attachments: p.attachments,
  totalCents: lineTotal(p.lines),
  receivedCents: lineReceived(p.lines),
});

const LineInput = z.object({
  id: z.string().max(64).optional(),
  desc: z.string().trim().min(1, "Describe every line").max(200),
  qty: z.number().min(0).max(1_000_000),
  /** Dollars. */
  unitCost: Money,
  receivedQty: z.number().min(0).max(1_000_000).default(0),
  bomItemId: z.string().max(64).nullable().optional(),
});

export const PoInput = z.object({
  poNumber: z.string().trim().min(1, "Give the PO a number").max(40),
  vendor: z.string().trim().max(120).default(""),
  date: Day.nullable().default(null),
  status: z.enum(PO_STATUSES).default("draft"),
  category: z.string().trim().min(1).max(40).default("Other"),
  notes: z.string().trim().max(2_000).default(""),
  lines: z.array(LineInput).max(200).default([]),
  attachments: Attachments.default([]),
});

/** All purchase orders in the workspace, or one project's. */
export async function listPurchaseOrders(db: Executor, actor: Actor, projectId?: string): Promise<PurchaseOrder[]> {
  requireEditor(actor, "purchasing");
  if (projectId) await loadProject(db, actor, projectId);
  const rows = await db
    .select({ po: purchaseOrders, projectName: projects.name })
    .from(purchaseOrders)
    .innerJoin(projects, eq(projects.id, purchaseOrders.projectId))
    .where(and(eq(purchaseOrders.workspaceId, actor.workspaceId), projectId ? eq(purchaseOrders.projectId, projectId) : undefined))
    .orderBy(desc(purchaseOrders.date), desc(purchaseOrders.createdAt));
  return rows.map(({ po, projectName }) => toPo(po, projectName));
}

/** The next free "PO-2026-007" style number. */
export async function nextPoNumber(db: Executor, actor: Actor, year = new Date().getFullYear()) {
  requireEditor(actor, "purchasing");
  const rows = await db
    .select({ n: purchaseOrders.poNumber })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.workspaceId, actor.workspaceId), sql`${purchaseOrders.poNumber} like ${`PO-${year}-%`}`));
  const max = rows.reduce((m, r) => Math.max(m, Number(r.n.split("-")[2]) || 0), 0);
  return `PO-${year}-${String(max + 1).padStart(3, "0")}`;
}

async function loadPo(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "purchasing");
  const [p] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.workspaceId, actor.workspaceId))).limit(1);
  if (!p) throw notFound("Purchase order not found.");
  return p;
}

async function checkPoNumber(db: Executor, actor: Actor, poNumber: string, selfId?: string) {
  const [dup] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.workspaceId, actor.workspaceId), sql`lower(${purchaseOrders.poNumber}) = lower(${poNumber})`))
    .limit(1);
  if (dup && dup.id !== selfId) throw invalid(`${poNumber} is already used by another purchase order.`);
}

async function toLines(db: Executor, projectId: string, lines: z.output<typeof LineInput>[]): Promise<PoLine[]> {
  const bomIds = lines.map((l) => l.bomItemId).filter(Boolean) as string[];
  if (bomIds.length) {
    const found = new Set((await db.select({ id: bomItems.id }).from(bomItems).where(and(eq(bomItems.projectId, projectId), inArray(bomItems.id, bomIds)))).map((b) => b.id));
    if (bomIds.some((b) => !found.has(b))) throw invalid("A line is linked to a BOM item from another project.");
  }
  return lines.map((l) => ({ id: l.id || crypto.randomUUID().slice(0, 8), desc: l.desc, qty: l.qty, unitCostCents: cents(l.unitCost), receivedQty: Math.min(l.receivedQty, l.qty), bomItemId: l.bomItemId ?? null }));
}

/**
 * Keeps the BOM in step with orders: lines on an ordered PO mark their BOM items Ordered, and fully received
 * lines mark them Received. Lines without a link match a BOM item by name, like the original app did.
 */
async function syncBom(db: Executor, projectId: string, status: PoStatus, lines: PoLine[]) {
  if (!["ordered", "partially_received", "received"].includes(status)) return;
  const bom = await db.select().from(bomItems).where(eq(bomItems.projectId, projectId));
  for (const l of lines) {
    const b = bom.find((x) => (l.bomItemId ? x.id === l.bomItemId : x.item.toLowerCase() === l.desc.toLowerCase()));
    if (!b) continue;
    const next: BomStatus | null = l.receivedQty >= l.qty && ["needed", "quoted", "ordered"].includes(b.status) ? "received" : ["needed", "quoted"].includes(b.status) ? "ordered" : null;
    if (next) await db.update(bomItems).set({ status: next, updatedAt: new Date() }).where(eq(bomItems.id, b.id));
  }
}

export async function createPurchaseOrder(db: Executor, actor: Actor, projectId: string, input: z.input<typeof PoInput>) {
  const project = await loadProject(db, actor, projectId);
  const data = PoInput.parse(input);
  await checkPoNumber(db, actor, data.poNumber);
  const lines = await toLines(db, project.id, data.lines);
  const status = deriveStatus(data.status, lines);
  const [row] = await db
    .insert(purchaseOrders)
    .values({ workspaceId: actor.workspaceId, projectId: project.id, ...data, lines, status, receivedDate: status === "received" ? (data.date ?? null) : null })
    .returning();
  await syncBom(db, project.id, status, lines);
  await logActivity(db, actor, { projectId: project.id, targetType: "po", targetId: row.id, targetName: row.poNumber, text: "created this purchase order" });
  return toPo(row, project.name);
}

const PO_LABELS = { poNumber: "PO number", vendor: "vendor", status: "status", date: "date" };

async function afterPoChange(db: Executor, actor: Actor, before: typeof purchaseOrders.$inferSelect, row: typeof purchaseOrders.$inferSelect, extra: string[] = []) {
  const text = [...describeChanges(before, row, PO_LABELS, (k, v) => (k === "status" ? PO_STATUS_LABEL[pick(PO_STATUSES, String(v), "draft")] : String(v))), ...extra].join(", ");
  await logActivity(db, actor, { projectId: row.projectId, targetType: "po", targetId: row.id, targetName: row.poNumber, text });
  if (before.status !== row.status) {
    const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, row.projectId));
    await emit(db, actor.workspaceId, "purchase.status", { id: row.id, poNumber: row.poNumber, vendor: row.vendor, project: p?.name, from: before.status, status: row.status, totalCents: lineTotal(row.lines) });
  }
}

export async function updatePurchaseOrder(db: Executor, actor: Actor, id: string, input: z.input<typeof PoInput>) {
  const before = await loadPo(db, actor, id);
  const data = PoInput.parse(input);
  await checkPoNumber(db, actor, data.poNumber, id);
  const lines = await toLines(db, before.projectId, data.lines);
  const status = deriveStatus(data.status, lines);
  const [row] = await db
    .update(purchaseOrders)
    .set({ ...data, lines, status, receivedDate: status === "received" ? (before.receivedDate ?? data.date) : null, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, id))
    .returning();
  await syncBom(db, row.projectId, status, lines);
  await afterPoChange(db, actor, before, row, lineTotal(before.lines) !== lineTotal(lines) ? [`changed the total from ${fmt(lineTotal(before.lines))} to ${fmt(lineTotal(lines))}`] : []);
  const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, row.projectId));
  return toPo(row, p.name);
}

export const ReceiveInput = z.object({
  /** Total received so far for each line, by line id. */
  received: z.record(z.string().max(64), z.number().min(0).max(1_000_000)),
  date: Day,
});

/** Records what has arrived. An approved or submitted PO becomes Ordered first; then the status follows the lines. */
export async function receivePurchaseOrder(db: Executor, actor: Actor, id: string, input: z.input<typeof ReceiveInput>) {
  const before = await loadPo(db, actor, id);
  const data = ReceiveInput.parse(input);
  if (["draft", "cancelled"].includes(before.status)) throw invalid("Order it before receiving it.");
  const lines = before.lines.map((l) => (l.id in data.received ? { ...l, receivedQty: Math.min(l.qty, data.received[l.id]) } : l));
  const base: PoStatus = ["submitted", "approved"].includes(before.status) ? "ordered" : pick(PO_STATUSES, before.status, "ordered");
  const status = deriveStatus(base, lines);
  const [row] = await db
    .update(purchaseOrders)
    .set({ lines, status, receivedDate: status === "received" ? data.date : before.receivedDate, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, id))
    .returning();
  await syncBom(db, row.projectId, status, lines);
  const got = lines.reduce((s, l, i) => s + Math.max(0, l.receivedQty - before.lines[i].receivedQty), 0);
  await afterPoChange(db, actor, before, row, got ? [`received ${got.toLocaleString("en-US")} item${got === 1 ? "" : "s"}`] : []);
}

export async function deletePurchaseOrder(db: Executor, actor: Actor, id: string) {
  const p = await loadPo(db, actor, id);
  await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  await logActivity(db, actor, { projectId: p.projectId, targetType: "project", targetId: p.projectId, targetName: p.poNumber, text: `deleted purchase order ${p.poNumber}` });
}

// ---------- Budget ----------

export async function projectBudget(db: Executor, actor: Actor, projectId: string) {
  const project = await loadProject(db, actor, projectId);
  const [bom, pos, sows, invs, lines] = await Promise.all([
    db.select().from(bomItems).where(eq(bomItems.projectId, projectId)),
    db.select().from(purchaseOrders).where(eq(purchaseOrders.projectId, projectId)),
    db.select().from(scopesOfWork).where(eq(scopesOfWork.projectId, projectId)),
    db.select().from(invoices).where(eq(invoices.projectId, projectId)),
    db.select().from(budgetLines).where(eq(budgetLines.projectId, projectId)).orderBy(asc(budgetLines.position), asc(budgetLines.category)),
  ]);
  return budgetFor({
    budgetCents: project.budgetCents,
    bom,
    pos: pos.map((p) => ({ category: p.category, status: pick(PO_STATUSES, p.status, "draft"), lines: p.lines })),
    sows: sows.map((s) => ({ status: pick(SOW_STATUSES, s.status, "draft") as SowStatus, valueCents: s.valueCents, category: s.category })),
    invoices: invs.map((i) => ({ status: pick(INVOICE_STATUSES, i.status, "received") as InvoiceStatus, amountCents: i.amountCents, category: i.category })),
    lines,
  });
}

// ---------------------------------------------------------------------------
// Budget lines: how much each category gets, and who pays for it
// ---------------------------------------------------------------------------

export type BudgetLine = { id: string; category: string; source: string; budgetCents: number; notes: string; position: number };

export const BudgetLineInput = z.object({
  category: z.string().trim().min(1, "Name the category").max(60),
  source: z.string().trim().max(60).default(""),
  /** Dollars. */
  budget: Money.default(0),
  notes: z.string().trim().max(1_000).default(""),
});

export async function listBudgetLines(db: Executor, actor: Actor, projectId: string): Promise<BudgetLine[]> {
  await loadProject(db, actor, projectId);
  const rows = await db.select().from(budgetLines).where(eq(budgetLines.projectId, projectId)).orderBy(asc(budgetLines.position), asc(budgetLines.category));
  return rows.map((r) => ({ id: r.id, category: r.category, source: r.source, budgetCents: r.budgetCents, notes: r.notes, position: r.position }));
}

/** The project's total budget follows its budget lines once it has any. */
export async function syncProjectBudget(db: Executor, projectId: string) {
  const [{ total }] = await db.select({ total: sql<number>`coalesce(sum(${budgetLines.budgetCents}), 0)::int` }).from(budgetLines).where(eq(budgetLines.projectId, projectId));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(budgetLines).where(eq(budgetLines.projectId, projectId));
  if (n > 0) await db.update(projects).set({ budgetCents: total, updatedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function saveBudgetLine(db: Executor, actor: Actor, projectId: string, input: z.input<typeof BudgetLineInput>, id?: string) {
  const project = await loadProject(db, actor, projectId);
  const data = BudgetLineInput.parse(input);
  const values = { category: data.category, source: data.source, budgetCents: Math.round(data.budget * 100), notes: data.notes };
  return db.transaction(async (tx) => {
    const [clash] = await tx.select({ id: budgetLines.id }).from(budgetLines).where(and(eq(budgetLines.projectId, project.id), sql`lower(${budgetLines.category}) = lower(${data.category})`)).limit(1);
    if (clash && clash.id !== id) throw invalid(`There's already a budget line for ${data.category}.`);
    if (id) {
      const [row] = await tx.update(budgetLines).set({ ...values, updatedAt: new Date() }).where(and(eq(budgetLines.id, id), eq(budgetLines.projectId, project.id))).returning();
      if (!row) throw notFound("Budget line not found.");
    } else {
      const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${budgetLines.position}), -1)::int + 1` }).from(budgetLines).where(eq(budgetLines.projectId, project.id));
      await tx.insert(budgetLines).values({ workspaceId: actor.workspaceId, projectId: project.id, position: next, ...values });
    }
    await syncProjectBudget(tx, project.id);
    await logActivity(tx, actor, { projectId: project.id, targetType: "project", targetId: project.id, targetName: project.name, text: `${id ? "updated" : "added"} the ${data.category} budget (${(values.budgetCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })})` });
  });
}

export async function deleteBudgetLine(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "budgets");
  const [line] = await db.select().from(budgetLines).where(and(eq(budgetLines.id, id), eq(budgetLines.workspaceId, actor.workspaceId))).limit(1);
  if (!line) throw notFound("Budget line not found.");
  await db.transaction(async (tx) => {
    await tx.delete(budgetLines).where(eq(budgetLines.id, id));
    await syncProjectBudget(tx, line.projectId);
  });
}
