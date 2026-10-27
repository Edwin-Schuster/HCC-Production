import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { cables, gear, layouts, type LayoutItem, type LayoutRun } from "@/db/schema";
import { CABLE_STATUSES, CABLE_STATUS_LABEL, DEVICE_TYPE_KEYS, type CableStatus } from "@/lib/cabling";
import { invalid, notFound } from "@/server/errors";
import type { Actor } from "@/server/permissions";
import { describeChanges, logActivity } from "./activity";
import { loadProject, requireEditor } from "./projects";

/** The cable schedule and room layouts for a project. Editors only. */

export type Cable = {
  id: string;
  projectId: string;
  label: string;
  type: string;
  from: string;
  to: string;
  lengthFt: number | null;
  status: CableStatus;
  room: string;
  notes: string;
};

const asStatus = (s: string): CableStatus => ((CABLE_STATUSES as readonly string[]).includes(s) ? (s as CableStatus) : "planned");
const toCable = (c: typeof cables.$inferSelect): Cable => ({ id: c.id, projectId: c.projectId, label: c.label, type: c.type, from: c.from, to: c.to, lengthFt: c.lengthFt, status: asStatus(c.status), room: c.room, notes: c.notes });

export const CableInput = z.object({
  label: z.string().trim().min(1, "Give the cable an ID, like NET-014").max(40),
  type: z.string().trim().min(1).max(40).default("Other"),
  from: z.string().trim().max(120).default(""),
  to: z.string().trim().max(120).default(""),
  lengthFt: z.number().min(0).max(100_000).nullable().default(null),
  status: z.enum(CABLE_STATUSES).default("planned"),
  room: z.string().trim().max(80).default(""),
  notes: z.string().trim().max(1_000).default(""),
});

export async function listCables(db: Executor, actor: Actor, projectId: string): Promise<Cable[]> {
  await loadProject(db, actor, projectId);
  const rows = await db.select().from(cables).where(eq(cables.projectId, projectId)).orderBy(asc(cables.label));
  return rows.map(toCable);
}

/** Counts by status and total feet by type. */
export function cableSummary(list: Cable[]) {
  const byStatus = Object.fromEntries(CABLE_STATUSES.map((s) => [s, list.filter((c) => c.status === s).length])) as Record<CableStatus, number>;
  const feet = new Map<string, number>();
  for (const c of list) feet.set(c.type, (feet.get(c.type) ?? 0) + (c.lengthFt ?? 0));
  const byType = [...feet].map(([type, ft]) => ({ type, ft })).sort((a, b) => b.ft - a.ft);
  return { total: list.length, byStatus, byType, totalFt: byType.reduce((s, x) => s + x.ft, 0) };
}

async function checkUnique(db: Executor, projectId: string, label: string, selfId?: string) {
  const [dup] = await db
    .select({ id: cables.id })
    .from(cables)
    .where(and(eq(cables.projectId, projectId), sql`lower(${cables.label}) = lower(${label})`))
    .limit(1);
  if (dup && dup.id !== selfId) throw invalid(`There's already a cable labelled ${label} in this project.`);
}

export async function createCable(db: Executor, actor: Actor, projectId: string, input: z.input<typeof CableInput>) {
  const project = await loadProject(db, actor, projectId);
  const data = CableInput.parse(input);
  await checkUnique(db, project.id, data.label);
  const [row] = await db.insert(cables).values({ workspaceId: actor.workspaceId, projectId: project.id, ...data }).returning();
  await logActivity(db, actor, { projectId: project.id, targetType: "cable", targetId: row.id, targetName: row.label, text: "added this cable" });
  return toCable(row);
}

async function loadCable(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "the cable schedule");
  const [c] = await db.select().from(cables).where(and(eq(cables.id, id), eq(cables.workspaceId, actor.workspaceId))).limit(1);
  if (!c) throw notFound("Cable not found.");
  return c;
}

const LABELS = { label: "cable ID", type: "type", from: "from", to: "to", lengthFt: "length", status: "status", room: "room" };

export async function updateCable(db: Executor, actor: Actor, id: string, input: z.input<typeof CableInput>) {
  const before = await loadCable(db, actor, id);
  const data = CableInput.parse(input);
  await checkUnique(db, before.projectId, data.label, id);
  const [row] = await db.update(cables).set({ ...data, updatedAt: new Date() }).where(eq(cables.id, id)).returning();
  const text = describeChanges(before, data, LABELS, (k, v) => (k === "status" ? CABLE_STATUS_LABEL[asStatus(String(v))] : k === "lengthFt" ? `${v} ft` : String(v))).join(", ");
  await logActivity(db, actor, { projectId: row.projectId, targetType: "cable", targetId: id, targetName: row.label, text });
  return toCable(row);
}

export async function deleteCable(db: Executor, actor: Actor, id: string) {
  const c = await loadCable(db, actor, id);
  await db.delete(cables).where(eq(cables.id, id));
  // Runs on layouts that pointed at this cable keep their line but lose the link.
  for (const l of await db.select().from(layouts).where(eq(layouts.projectId, c.projectId)))
    if (l.runs.some((r) => r.cableId === id)) await db.update(layouts).set({ runs: l.runs.map((r) => (r.cableId === id ? { ...r, cableId: undefined } : r)) }).where(eq(layouts.id, l.id));
  await logActivity(db, actor, { projectId: c.projectId, targetType: "project", targetId: c.projectId, targetName: c.label, text: `removed cable ${c.label}` });
}

// ---------- Room layouts ----------

export type Layout = { id: string; projectId: string; name: string; backgroundUrl: string | null; width: number; height: number; items: LayoutItem[]; runs: LayoutRun[]; updatedAt: string };
const toLayout = (l: typeof layouts.$inferSelect): Layout => ({ id: l.id, projectId: l.projectId, name: l.name, backgroundUrl: l.backgroundUrl, width: l.width, height: l.height, items: l.items, runs: l.runs, updatedAt: l.updatedAt.toISOString() });

const Coord = z.number().finite().min(-10_000).max(10_000);
const ItemInput = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(DEVICE_TYPE_KEYS as [string, ...string[]]),
  label: z.string().trim().max(80),
  x: Coord,
  y: Coord,
  w: z.number().min(10).max(10_000).optional(),
  h: z.number().min(10).max(10_000).optional(),
  gearId: z.string().max(64).optional(),
});
const RunInput = z.object({
  id: z.string().min(1).max(64),
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64),
  label: z.string().trim().max(60).default(""),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  cableId: z.string().max(64).optional(),
  style: z.enum(["straight", "elbow"]).optional(),
});

export const LayoutInput = z.object({
  name: z.string().trim().min(1, "Name the layout").max(120),
  backgroundUrl: z
    .string()
    .regex(/^\/files\/[0-9a-f-]{36}$/, "Upload the floor plan as an image")
    .nullable()
    .default(null),
  width: z.number().int().min(200).max(10_000).default(1000),
  height: z.number().int().min(200).max(10_000).default(640),
  items: z.array(ItemInput).max(1_000).default([]),
  runs: z.array(RunInput).max(2_000).default([]),
});

async function loadLayout(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "room layouts");
  const [l] = await db.select().from(layouts).where(and(eq(layouts.id, id), eq(layouts.workspaceId, actor.workspaceId))).limit(1);
  if (!l) throw notFound("Layout not found.");
  return l;
}

export async function listLayouts(db: Executor, actor: Actor, projectId: string): Promise<Layout[]> {
  await loadProject(db, actor, projectId);
  return (await db.select().from(layouts).where(eq(layouts.projectId, projectId)).orderBy(asc(layouts.name))).map(toLayout);
}

export async function getLayout(db: Executor, actor: Actor, id: string) {
  return toLayout(await loadLayout(db, actor, id));
}

export async function createLayout(db: Executor, actor: Actor, projectId: string, name = "New layout") {
  const project = await loadProject(db, actor, projectId);
  const [row] = await db.insert(layouts).values({ workspaceId: actor.workspaceId, projectId: project.id, name: name.trim().slice(0, 120) || "New layout" }).returning();
  await logActivity(db, actor, { projectId: project.id, targetType: "layout", targetId: row.id, targetName: row.name, text: "created this room layout" });
  return toLayout(row);
}

/** Saves the whole layout (the editor autosaves). Runs must join two items; links must point into this workspace. */
export async function saveLayout(db: Executor, actor: Actor, id: string, input: z.input<typeof LayoutInput>) {
  const before = await loadLayout(db, actor, id);
  const data = LayoutInput.parse(input);
  const itemIds = new Set(data.items.map((i) => i.id));
  if (itemIds.size !== data.items.length) throw invalid("Two items share an id.");
  const runs = data.runs.filter((r) => itemIds.has(r.from) && itemIds.has(r.to) && r.from !== r.to);
  const cableIds = new Set((await db.select({ id: cables.id }).from(cables).where(eq(cables.projectId, before.projectId))).map((c) => c.id));
  if (runs.some((r) => r.cableId && !cableIds.has(r.cableId))) throw invalid("A run is linked to a cable that isn't in this project.");
  const gearIds = data.items.map((i) => i.gearId).filter(Boolean) as string[];
  if (gearIds.length) {
    const found = new Set((await db.select({ id: gear.id }).from(gear).where(eq(gear.workspaceId, actor.workspaceId))).map((g) => g.id));
    if (gearIds.some((g) => !found.has(g))) throw invalid("An item is linked to gear that doesn't exist.");
  }
  const items = data.items.map((i) => (i.type === "zone" ? { ...i, w: i.w ?? 200, h: i.h ?? 120 } : i));
  const [row] = await db
    .update(layouts)
    .set({ ...data, items, runs, updatedAt: new Date() })
    .where(eq(layouts.id, id))
    .returning();
  if (before.name !== row.name) await logActivity(db, actor, { projectId: row.projectId, targetType: "layout", targetId: id, targetName: row.name, text: `renamed this layout from “${before.name}”` });
  return toLayout(row);
}

export async function deleteLayout(db: Executor, actor: Actor, id: string) {
  const l = await loadLayout(db, actor, id);
  await db.delete(layouts).where(eq(layouts.id, id));
  await logActivity(db, actor, { projectId: l.projectId, targetType: "project", targetId: l.projectId, targetName: l.name, text: `deleted the room layout “${l.name}”` });
}


/** Gear a layout item can be linked to. */
export async function gearOptions(db: Executor, actor: Actor) {
  requireEditor(actor, "gear");
  return db.select({ id: gear.id, name: gear.name, model: gear.model }).from(gear).where(eq(gear.workspaceId, actor.workspaceId)).orderBy(asc(gear.name));
}
