import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { contractors, invoices, projects, punchItems, scopesOfWork, siteAccess, type Attachment } from "@/db/schema";
import { INVOICE_STATUSES, INVOICE_STATUS_LABEL, SOW_STATUSES, SOW_STATUS_LABEL, type InvoiceStatus, type SowStatus } from "@/lib/purchasing";
import { PUNCH_STATUSES, PUNCH_STATUS_LABEL, type PunchStatus } from "@/lib/contractors";
import { addDays, today } from "@/lib/work";
import { invalid, notFound } from "@/server/errors";
import type { Actor } from "@/server/permissions";
import { describeChanges, logActivity } from "./activity";
import { Attachments } from "./files";
import { Day, loadProject, requireEditor } from "./projects";

/** Contractors: the directory, scopes of work, site access, punch lists and invoices. Editors only. */

const pick = <T extends string>(all: readonly T[], v: string, fallback: T): T => ((all as readonly string[]).includes(v) ? (v as T) : fallback);
const Money = z.number().min(0).max(100_000_000);
const cents = (dollars: number) => Math.round(dollars * 100);
const fmt = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const text = (max: number) => z.string().trim().max(max).default("");

async function inWorkspace<T extends { id: string; workspaceId: string }>(rows: T[], what: string): Promise<T> {
  const [r] = rows;
  if (!r) throw notFound(`${what} not found.`);
  return r;
}

async function checkContractor(db: Executor, actor: Actor, id: string | null | undefined) {
  if (!id) return;
  const [c] = await db.select({ id: contractors.id }).from(contractors).where(and(eq(contractors.id, id), eq(contractors.workspaceId, actor.workspaceId))).limit(1);
  if (!c) throw invalid("That contractor doesn't exist.");
}
async function checkProject(db: Executor, actor: Actor, id: string | null | undefined) {
  if (id) await loadProject(db, actor, id);
}

export type InsuranceState = "none" | "ok" | "expiring" | "expired";
/** Expiring = within 30 days. */
export function insuranceState(expires: string | null, todayStr = today()): InsuranceState {
  if (!expires) return "none";
  if (expires < todayStr) return "expired";
  return expires <= addDays(todayStr, 30) ? "expiring" : "ok";
}

// ---------- Directory ----------

export type Contractor = {
  id: string;
  company: string;
  contact: string;
  trade: string;
  phone: string;
  email: string;
  insuranceExpires: string | null;
  insurance: InsuranceState;
  rate: string;
  notes: string;
  attachments: Attachment[];
  openPunch: number;
  unpaidCents: number;
};

export const ContractorInput = z.object({
  company: z.string().trim().min(1, "Name the company").max(160),
  contact: text(120),
  trade: text(80),
  phone: text(40),
  email: z.union([z.literal(""), z.string().trim().email("That email doesn't look right").max(200)]).default(""),
  insuranceExpires: Day.nullable().default(null),
  rate: text(80),
  notes: text(4_000),
  attachments: Attachments.default([]),
});

export async function listContractors(db: Executor, actor: Actor, id?: string): Promise<Contractor[]> {
  requireEditor(actor, "contractors");
  // "contractors"."id" is spelled out: Drizzle leaves columns unqualified in a single-table select.
  const openPunch = sql<number>`(select count(*)::int from ${punchItems} p where p.contractor_id = "contractors"."id" and p.status <> 'closed')`;
  const unpaid = sql<number>`(select coalesce(sum(i.amount_cents), 0)::int from ${invoices} i where i.contractor_id = "contractors"."id" and i.status <> 'paid')`;
  const rows = await db
    .select({ c: contractors, openPunch, unpaid })
    .from(contractors)
    .where(and(eq(contractors.workspaceId, actor.workspaceId), id ? eq(contractors.id, id) : undefined))
    .orderBy(asc(contractors.company));
  const t = today();
  return rows.map(({ c, openPunch, unpaid }) => ({
    id: c.id,
    company: c.company,
    contact: c.contact,
    trade: c.trade,
    phone: c.phone,
    email: c.email,
    insuranceExpires: c.insuranceExpires,
    insurance: insuranceState(c.insuranceExpires, t),
    rate: c.rate,
    notes: c.notes,
    attachments: c.attachments,
    openPunch,
    unpaidCents: unpaid,
  }));
}

export async function getContractor(db: Executor, actor: Actor, id: string) {
  const [c] = await listContractors(db, actor, id);
  if (!c) throw notFound("Contractor not found.");
  return c;
}

export async function createContractor(db: Executor, actor: Actor, input: z.input<typeof ContractorInput>) {
  requireEditor(actor, "contractors");
  const data = ContractorInput.parse(input);
  const [row] = await db.insert(contractors).values({ workspaceId: actor.workspaceId, ...data }).returning();
  return row;
}

export async function updateContractor(db: Executor, actor: Actor, id: string, input: z.input<typeof ContractorInput>) {
  await getContractor(db, actor, id);
  const data = ContractorInput.parse(input);
  await db.update(contractors).set({ ...data, updatedAt: new Date() }).where(eq(contractors.id, id));
}

/** Deletes the contractor with their scopes, site access and invoices. Punch items stay, unassigned. */
export async function deleteContractor(db: Executor, actor: Actor, id: string) {
  await getContractor(db, actor, id);
  await db.delete(contractors).where(eq(contractors.id, id));
}

// ---------- Scopes of work ----------

export type Scope = { id: string; contractorId: string; company: string; projectId: string | null; projectName: string | null; title: string; status: SowStatus; valueCents: number; start: string | null; end: string | null; body: string; attachments: Attachment[] };

export const ScopeInput = z
  .object({
    contractorId: z.string().min(1, "Pick the contractor").max(64),
    projectId: z.string().max(64).nullable().default(null),
    title: z.string().trim().min(1, "Give the scope a title").max(200),
    status: z.enum(SOW_STATUSES).default("draft"),
    /** Dollars. */
    value: Money.default(0),
    start: Day.nullable().default(null),
    end: Day.nullable().default(null),
    body: z.string().max(50_000).default(""),
    attachments: Attachments.default([]),
  })
  .refine((s) => !s.start || !s.end || s.end >= s.start, { message: "The end date is before the start", path: ["end"] });

export async function listScopes(db: Executor, actor: Actor, where: { contractorId?: string; projectId?: string }): Promise<Scope[]> {
  requireEditor(actor, "contractors");
  const rows = await db
    .select({ s: scopesOfWork, company: contractors.company, projectName: projects.name })
    .from(scopesOfWork)
    .innerJoin(contractors, eq(contractors.id, scopesOfWork.contractorId))
    .leftJoin(projects, eq(projects.id, scopesOfWork.projectId))
    .where(and(eq(scopesOfWork.workspaceId, actor.workspaceId), where.contractorId ? eq(scopesOfWork.contractorId, where.contractorId) : undefined, where.projectId ? eq(scopesOfWork.projectId, where.projectId) : undefined))
    .orderBy(asc(scopesOfWork.start), asc(scopesOfWork.title));
  return rows.map(({ s, company, projectName }) => ({ id: s.id, contractorId: s.contractorId, company, projectId: s.projectId, projectName, title: s.title, status: pick(SOW_STATUSES, s.status, "draft"), valueCents: s.valueCents, start: s.start, end: s.end, body: s.body, attachments: s.attachments }));
}

const SOW_LABELS = { title: "title", status: "status", valueCents: "value", start: "start date", end: "end date", body: "description" };

export async function saveScope(db: Executor, actor: Actor, input: z.input<typeof ScopeInput>, id?: string) {
  requireEditor(actor, "contractors");
  const { value, ...data } = ScopeInput.parse(input);
  await checkContractor(db, actor, data.contractorId);
  await checkProject(db, actor, data.projectId);
  const next = { ...data, valueCents: cents(value) };
  if (!id) {
    const [row] = await db.insert(scopesOfWork).values({ workspaceId: actor.workspaceId, ...next }).returning();
    if (row.projectId) await logActivity(db, actor, { projectId: row.projectId, targetType: "sow", targetId: row.id, targetName: row.title, text: "added this scope of work" });
    return row;
  }
  const before = await inWorkspace(await db.select().from(scopesOfWork).where(and(eq(scopesOfWork.id, id), eq(scopesOfWork.workspaceId, actor.workspaceId))), "Scope of work");
  const [row] = await db.update(scopesOfWork).set({ ...next, updatedAt: new Date() }).where(eq(scopesOfWork.id, id)).returning();
  const change = describeChanges(before, next, SOW_LABELS, (k, v) => (k === "status" ? SOW_STATUS_LABEL[pick(SOW_STATUSES, String(v), "draft")] : k === "valueCents" ? fmt(Number(v)) : String(v))).join(", ");
  if (row.projectId) await logActivity(db, actor, { projectId: row.projectId, targetType: "sow", targetId: id, targetName: row.title, text: change });
  return row;
}

export async function deleteScope(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "contractors");
  await inWorkspace(await db.select().from(scopesOfWork).where(and(eq(scopesOfWork.id, id), eq(scopesOfWork.workspaceId, actor.workspaceId))), "Scope of work");
  await db.delete(scopesOfWork).where(eq(scopesOfWork.id, id));
}

// ---------- Site access ----------

export type Access = { id: string; contractorId: string | null; company: string | null; who: string; from: string | null; to: string | null; hours: string; areas: string; badge: string; approvedBy: string; notes: string };

export const AccessInput = z
  .object({
    contractorId: z.string().max(64).nullable().default(null),
    who: z.string().trim().min(1, "Say who is coming").max(160),
    from: Day,
    to: Day.nullable().default(null),
    hours: text(80),
    areas: text(300),
    badge: text(120),
    approvedBy: text(120),
    notes: text(2_000),
  })
  .refine((a) => !a.to || a.to >= a.from, { message: "The last day is before the first", path: ["to"] });

/** Site access windows; `upcoming` keeps those that haven't ended. */
export async function listAccess(db: Executor, actor: Actor, where: { contractorId?: string; upcoming?: boolean } = {}): Promise<Access[]> {
  requireEditor(actor, "contractors");
  const t = today();
  const rows = await db
    .select({ a: siteAccess, company: contractors.company })
    .from(siteAccess)
    .leftJoin(contractors, eq(contractors.id, siteAccess.contractorId))
    .where(
      and(
        eq(siteAccess.workspaceId, actor.workspaceId),
        where.contractorId ? eq(siteAccess.contractorId, where.contractorId) : undefined,
        where.upcoming ? sql`coalesce(${siteAccess.to}, ${siteAccess.from}) >= ${t}` : undefined,
      ),
    )
    .orderBy(asc(siteAccess.from));
  return rows.map(({ a, company }) => ({ id: a.id, contractorId: a.contractorId, company, who: a.who, from: a.from, to: a.to, hours: a.hours, areas: a.areas, badge: a.badge, approvedBy: a.approvedBy, notes: a.notes }));
}

export async function saveAccess(db: Executor, actor: Actor, input: z.input<typeof AccessInput>, id?: string) {
  requireEditor(actor, "contractors");
  const data = AccessInput.parse(input);
  await checkContractor(db, actor, data.contractorId);
  if (!id) return (await db.insert(siteAccess).values({ workspaceId: actor.workspaceId, ...data }).returning())[0];
  await inWorkspace(await db.select().from(siteAccess).where(and(eq(siteAccess.id, id), eq(siteAccess.workspaceId, actor.workspaceId))), "Site access");
  return (await db.update(siteAccess).set({ ...data, updatedAt: new Date() }).where(eq(siteAccess.id, id)).returning())[0];
}

export async function deleteAccess(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "contractors");
  await inWorkspace(await db.select().from(siteAccess).where(and(eq(siteAccess.id, id), eq(siteAccess.workspaceId, actor.workspaceId))), "Site access");
  await db.delete(siteAccess).where(eq(siteAccess.id, id));
}

// ---------- Punch list ----------

export type Punch = { id: string; projectId: string; projectName: string; contractorId: string | null; company: string | null; location: string; description: string; status: PunchStatus; due: string | null; photos: Attachment[] };

export const PunchInput = z.object({
  projectId: z.string().min(1, "Pick the project").max(64),
  contractorId: z.string().max(64).nullable().default(null),
  location: text(160),
  description: z.string().trim().min(1, "Describe what needs doing").max(1_000),
  status: z.enum(PUNCH_STATUSES).default("open"),
  due: Day.nullable().default(null),
  photos: Attachments.default([]),
});

export async function listPunch(db: Executor, actor: Actor, where: { projectId?: string; contractorId?: string; open?: boolean } = {}): Promise<Punch[]> {
  requireEditor(actor, "punch lists");
  const rows = await db
    .select({ p: punchItems, projectName: projects.name, company: contractors.company })
    .from(punchItems)
    .innerJoin(projects, eq(projects.id, punchItems.projectId))
    .leftJoin(contractors, eq(contractors.id, punchItems.contractorId))
    .where(
      and(
        eq(punchItems.workspaceId, actor.workspaceId),
        where.projectId ? eq(punchItems.projectId, where.projectId) : undefined,
        where.contractorId ? eq(punchItems.contractorId, where.contractorId) : undefined,
        where.open ? ne(punchItems.status, "closed") : undefined,
      ),
    )
    .orderBy(sql`${punchItems.status} = 'closed'`, sql`${punchItems.due} asc nulls last`, desc(punchItems.createdAt));
  return rows.map(({ p, projectName, company }) => ({ id: p.id, projectId: p.projectId, projectName, contractorId: p.contractorId, company, location: p.location, description: p.description, status: pick(PUNCH_STATUSES, p.status, "open"), due: p.due, photos: p.photos }));
}

const PUNCH_LABELS = { description: "description", location: "location", status: "status", due: "due date", contractorId: "contractor" };

export async function savePunch(db: Executor, actor: Actor, input: z.input<typeof PunchInput>, id?: string) {
  requireEditor(actor, "punch lists");
  const data = PunchInput.parse(input);
  await loadProject(db, actor, data.projectId);
  await checkContractor(db, actor, data.contractorId);
  const name = data.description.slice(0, 80);
  if (!id) {
    const [row] = await db.insert(punchItems).values({ workspaceId: actor.workspaceId, ...data }).returning();
    await logActivity(db, actor, { projectId: row.projectId, targetType: "punch", targetId: row.id, targetName: name, text: "added this punch item" });
    return row;
  }
  const before = await inWorkspace(await db.select().from(punchItems).where(and(eq(punchItems.id, id), eq(punchItems.workspaceId, actor.workspaceId))), "Punch item");
  const [row] = await db.update(punchItems).set({ ...data, updatedAt: new Date() }).where(eq(punchItems.id, id)).returning();
  const names = new Map((await db.select({ id: contractors.id, company: contractors.company }).from(contractors).where(inArray(contractors.id, [before.contractorId, row.contractorId].filter(Boolean) as string[]))).map((c) => [c.id, c.company]));
  const change = [
    ...describeChanges(before, data, PUNCH_LABELS, (k, v) => (k === "status" ? PUNCH_STATUS_LABEL[pick(PUNCH_STATUSES, String(v), "open")] : k === "contractorId" ? (names.get(String(v)) ?? "someone") : String(v))),
    ...(data.photos.length > before.photos.length ? ["added a photo"] : []),
  ].join(", ");
  await logActivity(db, actor, { projectId: row.projectId, targetType: "punch", targetId: id, targetName: name, text: change });
  return row;
}

export async function deletePunch(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "punch lists");
  const p = await inWorkspace(await db.select().from(punchItems).where(and(eq(punchItems.id, id), eq(punchItems.workspaceId, actor.workspaceId))), "Punch item");
  await db.delete(punchItems).where(eq(punchItems.id, id));
  await logActivity(db, actor, { projectId: p.projectId, targetType: "project", targetId: p.projectId, targetName: p.description, text: `removed the punch item “${p.description.slice(0, 80)}”` });
}

// ---------- Invoices ----------

export type Invoice = { id: string; contractorId: string | null; company: string | null; projectId: string | null; projectName: string | null; number: string; date: string | null; dueDate: string | null; amountCents: number; status: InvoiceStatus; notes: string; attachments: Attachment[] };

export const InvoiceInput = z.object({
  contractorId: z.string().min(1, "Pick the contractor").max(64),
  projectId: z.string().max(64).nullable().default(null),
  number: text(60),
  date: Day.nullable().default(null),
  dueDate: Day.nullable().default(null),
  /** Dollars. */
  amount: Money.default(0),
  status: z.enum(INVOICE_STATUSES).default("received"),
  notes: text(2_000),
  attachments: Attachments.default([]),
});

export async function listInvoices(db: Executor, actor: Actor, where: { contractorId?: string; projectId?: string } = {}): Promise<Invoice[]> {
  requireEditor(actor, "invoices");
  const rows = await db
    .select({ i: invoices, company: contractors.company, projectName: projects.name })
    .from(invoices)
    .leftJoin(contractors, eq(contractors.id, invoices.contractorId))
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .where(and(eq(invoices.workspaceId, actor.workspaceId), where.contractorId ? eq(invoices.contractorId, where.contractorId) : undefined, where.projectId ? eq(invoices.projectId, where.projectId) : undefined))
    .orderBy(desc(invoices.date), desc(invoices.createdAt));
  return rows.map(({ i, company, projectName }) => ({ id: i.id, contractorId: i.contractorId, company, projectId: i.projectId, projectName, number: i.number, date: i.date, dueDate: i.dueDate, amountCents: i.amountCents, status: pick(INVOICE_STATUSES, i.status, "received"), notes: i.notes, attachments: i.attachments }));
}

const INVOICE_LABELS = { number: "number", amountCents: "amount", status: "status", dueDate: "due date" };

export async function saveInvoice(db: Executor, actor: Actor, input: z.input<typeof InvoiceInput>, id?: string) {
  requireEditor(actor, "invoices");
  const { amount, ...data } = InvoiceInput.parse(input);
  await checkContractor(db, actor, data.contractorId);
  await checkProject(db, actor, data.projectId);
  const next = { ...data, amountCents: cents(amount) };
  const name = `Invoice ${data.number || "(no number)"}`;
  if (!id) {
    const [row] = await db.insert(invoices).values({ workspaceId: actor.workspaceId, ...next }).returning();
    if (row.projectId) await logActivity(db, actor, { projectId: row.projectId, targetType: "invoice", targetId: row.id, targetName: name, text: `logged this invoice for ${fmt(row.amountCents)}` });
    return row;
  }
  const before = await inWorkspace(await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.workspaceId, actor.workspaceId))), "Invoice");
  const [row] = await db.update(invoices).set({ ...next, updatedAt: new Date() }).where(eq(invoices.id, id)).returning();
  const change = describeChanges(before, next, INVOICE_LABELS, (k, v) => (k === "status" ? INVOICE_STATUS_LABEL[pick(INVOICE_STATUSES, String(v), "received")] : k === "amountCents" ? fmt(Number(v)) : String(v))).join(", ");
  if (row.projectId) await logActivity(db, actor, { projectId: row.projectId, targetType: "invoice", targetId: id, targetName: name, text: change });
  return row;
}

export async function deleteInvoice(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "invoices");
  await inWorkspace(await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.workspaceId, actor.workspaceId))), "Invoice");
  await db.delete(invoices).where(eq(invoices.id, id));
}

/** Contractors whose insurance has expired or expires within 30 days, for warnings. */
export async function insuranceWarnings(db: Executor, actor: Actor) {
  const soon = addDays(today(), 30);
  const rows = await db
    .select({ id: contractors.id, company: contractors.company, insuranceExpires: contractors.insuranceExpires })
    .from(contractors)
    .where(and(eq(contractors.workspaceId, actor.workspaceId), sql`${contractors.insuranceExpires} is not null`, sql`${contractors.insuranceExpires} <= ${soon}`))
    .orderBy(asc(contractors.insuranceExpires));
  return rows.map((r) => ({ ...r, insurance: insuranceState(r.insuranceExpires) }));
}

