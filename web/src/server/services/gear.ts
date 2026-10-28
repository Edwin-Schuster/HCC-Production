import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { gear, users, type Attachment, type ConfigBackup, type FirmwareChange } from "@/db/schema";
import { GEAR_STATUSES, GEAR_STATUS_LABEL, type GearStatus } from "@/lib/gear";
import { today } from "@/lib/work";
import { invalid, notFound } from "@/server/errors";
import type { Actor } from "@/server/permissions";
import { describeChanges, logActivity } from "./activity";
import { AttachmentSchema, Attachments, readTextFile } from "./files";
import { Day, requireEditor } from "./projects";

/** The equipment inventory: serials, asset tags, firmware history, config backups and photos. Editors only. */

export type GearItem = {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  serial: string;
  assetTag: string;
  location: string;
  status: GearStatus;
  firmware: string;
  firmwareUpdated: string | null;
  firmwareHistory: (FirmwareChange & { byName: string | null })[];
  ip: string;
  mac: string;
  purchaseDate: string | null;
  warranty: string | null;
  notes: string;
  configs: (ConfigBackup & { byName: string | null })[];
  photos: Attachment[];
};

const text = (max: number) => z.string().trim().max(max).default("");

export const GearInput = z.object({
  name: z.string().trim().min(1, "Name the item").max(160),
  category: z.string().trim().min(1).max(40).default("Other"),
  manufacturer: text(120),
  model: text(120),
  serial: text(120),
  assetTag: text(60),
  location: text(160),
  status: z.enum(GEAR_STATUSES).default("in_service"),
  ip: z
    .string()
    .trim()
    .max(64)
    .regex(/^$|^[0-9a-fA-F:.\/]+$/, "That IP address doesn't look right")
    .default(""),
  mac: z
    .string()
    .trim()
    .max(32)
    .regex(/^$|^[0-9a-fA-F]{2}([:-]?[0-9a-fA-F]{2}){5}$/, "That MAC address doesn't look right")
    .default(""),
  purchaseDate: Day.nullable().default(null),
  warranty: Day.nullable().default(null),
  notes: text(4_000),
  photos: Attachments.default([]),
});

async function names(db: Executor, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function toItems(db: Executor, rows: (typeof gear.$inferSelect)[]): Promise<GearItem[]> {
  const who = await names(db, rows.flatMap((g) => [...g.firmwareHistory.map((h) => h.by), ...g.configs.map((c) => c.by)]));
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    category: g.category,
    manufacturer: g.manufacturer,
    model: g.model,
    serial: g.serial,
    assetTag: g.assetTag,
    location: g.location,
    status: (GEAR_STATUSES as readonly string[]).includes(g.status) ? (g.status as GearStatus) : "in_service",
    firmware: g.firmware,
    firmwareUpdated: g.firmwareUpdated,
    firmwareHistory: g.firmwareHistory.map((h) => ({ ...h, byName: who.get(h.by) ?? null })),
    ip: g.ip,
    mac: g.mac,
    purchaseDate: g.purchaseDate,
    warranty: g.warranty,
    notes: g.notes,
    configs: g.configs.map((c) => ({ ...c, byName: who.get(c.by) ?? null })),
    photos: g.photos,
  }));
}

export async function listGear(db: Executor, actor: Actor): Promise<GearItem[]> {
  requireEditor(actor, "gear");
  return toItems(db, await db.select().from(gear).where(eq(gear.workspaceId, actor.workspaceId)).orderBy(asc(gear.category), asc(gear.name)));
}

async function loadGear(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "gear");
  const [g] = await db.select().from(gear).where(and(eq(gear.id, id), eq(gear.workspaceId, actor.workspaceId))).limit(1);
  if (!g) throw notFound("Gear not found.");
  return g;
}

export async function getGear(db: Executor, actor: Actor, id: string) {
  return (await toItems(db, [await loadGear(db, actor, id)]))[0];
}

const log = (actor: Actor, g: { id: string; name: string }, text: string) => ({ projectId: null, targetType: "gear", targetId: g.id, targetName: g.name, text });

export async function createGear(db: Executor, actor: Actor, input: z.input<typeof GearInput> & { firmware?: string }) {
  requireEditor(actor, "gear");
  const data = GearInput.parse(input);
  const firmware = z.string().trim().max(60).default("").parse(input.firmware);
  const [row] = await db
    .insert(gear)
    .values({ workspaceId: actor.workspaceId, ...data, firmware, firmwareUpdated: firmware ? today() : null })
    .returning();
  await logActivity(db, actor, log(actor, row, "added this to the inventory"));
  return row;
}

const LABELS = { name: "name", status: "status", location: "location", serial: "serial number", assetTag: "asset tag", ip: "IP address" };

export async function updateGear(db: Executor, actor: Actor, id: string, input: z.input<typeof GearInput>) {
  const before = await loadGear(db, actor, id);
  const data = GearInput.parse(input);
  const [row] = await db.update(gear).set({ ...data, updatedAt: new Date() }).where(eq(gear.id, id)).returning();
  const change = [
    ...describeChanges(before, data, LABELS, (k, v) => (k === "status" ? GEAR_STATUS_LABEL[v as GearStatus] ?? String(v) : String(v))),
    ...(data.photos.length > before.photos.length ? ["added a photo"] : []),
  ].join(", ");
  await logActivity(db, actor, log(actor, row, change));
  return row;
}

export async function deleteGear(db: Executor, actor: Actor, id: string) {
  await loadGear(db, actor, id);
  await db.delete(gear).where(eq(gear.id, id));
}

export const FirmwareInput = z.object({ version: z.string().trim().min(1, "Enter the new version").max(60), note: text(500), date: Day.optional() });

/** Logs a firmware update: the new version, when, who, and from what. */
export async function logFirmware(db: Executor, actor: Actor, id: string, input: z.input<typeof FirmwareInput>) {
  const g = await loadGear(db, actor, id);
  const data = FirmwareInput.parse(input);
  if (data.version === g.firmware) throw invalid(`It's already on ${g.firmware}.`);
  const date = data.date ?? today();
  const entry: FirmwareChange = { from: g.firmware, to: data.version, at: date, by: actor.userId ?? "", ...(data.note ? { note: data.note } : {}) };
  await db
    .update(gear)
    .set({ firmware: data.version, firmwareUpdated: date, firmwareHistory: [...g.firmwareHistory, entry], updatedAt: new Date() })
    .where(eq(gear.id, id));
  await logActivity(db, actor, log(actor, g, `updated firmware ${g.firmware ? `from ${g.firmware} ` : ""}to ${data.version}`));
}

export const ConfigInput = z.object({ file: AttachmentSchema, note: text(500) });

/** Adds a config backup, recording the firmware it was taken on. */
export async function addConfigBackup(db: Executor, actor: Actor, id: string, input: z.input<typeof ConfigInput>) {
  const g = await loadGear(db, actor, id);
  const { file, note } = ConfigInput.parse(input);
  if (file.external) throw invalid("Upload the backup file itself.");
  const backup: ConfigBackup = { id: crypto.randomUUID().slice(0, 8), url: file.url, name: file.name, size: file.size ?? 0, mime: file.mime, note, firmware: g.firmware || undefined, at: new Date().toISOString(), by: actor.userId ?? "" };
  await db.update(gear).set({ configs: [...g.configs, backup], updatedAt: new Date() }).where(eq(gear.id, id));
  await logActivity(db, actor, log(actor, g, `uploaded the config backup “${file.name}”`));
  return backup;
}

export async function removeConfigBackup(db: Executor, actor: Actor, id: string, backupId: string) {
  const g = await loadGear(db, actor, id);
  const target = g.configs.find((c) => c.id === backupId);
  if (!target) throw notFound("Backup not found.");
  await db.update(gear).set({ configs: g.configs.filter((c) => c.id !== backupId), updatedAt: new Date() }).where(eq(gear.id, id));
  await logActivity(db, actor, log(actor, g, `removed the config backup “${target.name}”`));
}

/** The text of a backup, for the viewer. */
export async function readConfigBackup(db: Executor, actor: Actor, id: string, backupId: string) {
  const g = await loadGear(db, actor, id);
  const c = g.configs.find((x) => x.id === backupId);
  if (!c) throw notFound("Backup not found.");
  const fileId = c.url.match(/^\/files\/([0-9a-f-]{36})$/)?.[1];
  if (!fileId) throw invalid("That backup isn't stored here.");
  return readTextFile(db, actor, fileId);
}
