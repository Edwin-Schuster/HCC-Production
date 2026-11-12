import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { gear, layouts, projects, publicRooms, publicServices, publicSite } from "@/db/schema";
import type { LayoutItem, LayoutRun } from "@/db/schema";
import { DEFAULT_GUESTS_BODY, DEFAULT_HERO_INTRO, DEFAULT_HERO_TITLE, DEFAULT_ROOMS, DEFAULT_SERVICES, GEAR_GROUPS, groupFor, isGearGroup, type GearGroup } from "@/lib/public-site";
import { forbidden, invalid, notFound } from "@/server/errors";
import { atLeast, type Actor } from "@/server/permissions";

/**
 * The public site: what HCC Production is and offers, for anyone, signed in or not.
 *
 * Everything a public page shows comes from the public* functions below, which select only public columns.
 * Gear in particular is read field by field (public name, quantity, public note, group), so serial numbers,
 * IPs, MACs, purchase details, notes and config backups can never reach a public page.
 */

const requireEditor = (actor: Actor) => {
  if (!atLeast(actor, "editor")) throw forbidden("Only editors can change the public site.");
};

/** Creates the site's starting text, service cards and rooms the first time it's read. */
async function ensureSite(db: Executor, workspaceId: string) {
  const created = await db
    .insert(publicSite)
    .values({ workspaceId, heroTitle: DEFAULT_HERO_TITLE, heroIntro: DEFAULT_HERO_INTRO, guestsBody: DEFAULT_GUESTS_BODY })
    .onConflictDoNothing()
    .returning({ workspaceId: publicSite.workspaceId });
  if (!created.length) return;
  const [{ n: services }] = await db.select({ n: sql<number>`count(*)::int` }).from(publicServices).where(eq(publicServices.workspaceId, workspaceId));
  if (!services) await db.insert(publicServices).values(DEFAULT_SERVICES.map(([title, body], position) => ({ workspaceId, title, body, position })));
  const [{ n: rooms }] = await db.select({ n: sql<number>`count(*)::int` }).from(publicRooms).where(eq(publicRooms.workspaceId, workspaceId));
  if (!rooms) await db.insert(publicRooms).values(DEFAULT_ROOMS.map((name, position) => ({ workspaceId, name, position })));
}

// ---------------------------------------------------------------------------
// Public reads (anyone)
// ---------------------------------------------------------------------------

export type SiteText = { heroTitle: string; heroIntro: string; guestsBody: string };
export type PublicService = { id: string; title: string; body: string; photoUrl: string | null };
export type PublicGear = { name: string; qty: number; note: string };
export type StagePlot = { name: string; backgroundUrl: string | null; width: number; height: number; items: LayoutItem[]; runs: LayoutRun[] };
export type PublicRoom = { id: string; name: string; notes: string; plot: StagePlot | null; gear: { group: GearGroup; label: string; items: PublicGear[] }[] };

export async function siteText(db: Executor, actor: Actor): Promise<SiteText> {
  await ensureSite(db, actor.workspaceId);
  const [row] = await db.select({ heroTitle: publicSite.heroTitle, heroIntro: publicSite.heroIntro, guestsBody: publicSite.guestsBody }).from(publicSite).where(eq(publicSite.workspaceId, actor.workspaceId));
  return row;
}

export async function publicServiceCards(db: Executor, actor: Actor): Promise<PublicService[]> {
  await ensureSite(db, actor.workspaceId);
  return db
    .select({ id: publicServices.id, title: publicServices.title, body: publicServices.body, photoUrl: publicServices.photoUrl })
    .from(publicServices)
    .where(eq(publicServices.workspaceId, actor.workspaceId))
    .orderBy(asc(publicServices.position), asc(publicServices.createdAt));
}

/** A room layout as a stage plot: drawing only. Links to gear records and cables are dropped. */
function toPlot(l: typeof layouts.$inferSelect): StagePlot {
  return {
    name: l.name,
    backgroundUrl: l.backgroundUrl,
    width: l.width,
    height: l.height,
    items: l.items.map(({ gearId: _g, ...i }) => i),
    runs: l.runs.map(({ cableId: _c, ...r }) => r),
  };
}

/** Rooms with their public gear (grouped Audio, Video, Lighting, Stage & power), notes and stage plot. */
export async function publicRoomList(db: Executor, actor: Actor, roomId?: string): Promise<PublicRoom[]> {
  await ensureSite(db, actor.workspaceId);
  const rooms = await db
    .select({ id: publicRooms.id, name: publicRooms.name, notes: publicRooms.notes, layoutId: publicRooms.layoutId })
    .from(publicRooms)
    .where(and(eq(publicRooms.workspaceId, actor.workspaceId), roomId ? eq(publicRooms.id, roomId) : undefined))
    .orderBy(asc(publicRooms.position), asc(publicRooms.createdAt));
  if (!rooms.length) return [];
  // Only public columns, and only gear marked public with a public name.
  const items = await db
    .select({ roomId: gear.publicRoomId, name: gear.publicName, qty: gear.publicQty, note: gear.publicNote, group: gear.publicGroup })
    .from(gear)
    .where(and(eq(gear.workspaceId, actor.workspaceId), eq(gear.publicShow, true), sql`${gear.publicName} <> ''`, inArray(gear.publicRoomId, rooms.map((r) => r.id))))
    .orderBy(asc(gear.publicName));
  const layoutIds = rooms.map((r) => r.layoutId).filter((x): x is string => Boolean(x));
  const plots = layoutIds.length ? await db.select().from(layouts).where(and(eq(layouts.workspaceId, actor.workspaceId), inArray(layouts.id, layoutIds))) : [];
  return rooms.map((r) => {
    const mine = items.filter((i) => i.roomId === r.id);
    const plot = plots.find((p) => p.id === r.layoutId);
    return {
      id: r.id,
      name: r.name,
      notes: r.notes,
      plot: plot ? toPlot(plot) : null,
      gear: GEAR_GROUPS.map(([group, label]) => ({ group, label, items: mine.filter((i) => (isGearGroup(i.group) ? i.group : "stage") === group).map((i) => ({ name: i.name, qty: i.qty, note: i.note })) })).filter((g) => g.items.length),
    };
  });
}

export async function publicRoom(db: Executor, actor: Actor, roomId: string): Promise<PublicRoom> {
  if (!/^[\w-]{1,64}$/.test(roomId)) throw notFound("Room not found.");
  const [room] = await publicRoomList(db, actor, roomId);
  if (!room) throw notFound("Room not found.");
  return room;
}

// ---------------------------------------------------------------------------
// Editing (editors and admins)
// ---------------------------------------------------------------------------

const md = (max: number) => z.string().max(max).default("");

export const SiteTextInput = z.object({
  heroTitle: z.string().trim().min(1, "Give the home page a title").max(120),
  heroIntro: md(4_000),
  guestsBody: md(20_000),
});

export async function saveSiteText(db: Executor, actor: Actor, input: z.input<typeof SiteTextInput>) {
  requireEditor(actor);
  await ensureSite(db, actor.workspaceId);
  const data = SiteTextInput.parse(input);
  await db.update(publicSite).set({ ...data, updatedAt: new Date() }).where(eq(publicSite.workspaceId, actor.workspaceId));
}

const PhotoUrl = z
  .string()
  .trim()
  .max(2_000)
  .regex(/^\/files\/[0-9a-f-]{36}$/, "Upload the photo here")
  .nullable()
  .default(null);

export const ServiceInput = z.object({
  title: z.string().trim().min(1, "Name the service").max(120),
  body: z.string().trim().max(1_000).default(""),
  photoUrl: PhotoUrl,
});

export async function saveService(db: Executor, actor: Actor, input: z.input<typeof ServiceInput>, id?: string) {
  requireEditor(actor);
  await ensureSite(db, actor.workspaceId);
  const data = ServiceInput.parse(input);
  if (id) {
    const [row] = await db.update(publicServices).set({ ...data, updatedAt: new Date() }).where(and(eq(publicServices.id, id), eq(publicServices.workspaceId, actor.workspaceId))).returning({ id: publicServices.id });
    if (!row) throw notFound("Service not found.");
    return;
  }
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${publicServices.position}), -1)::int + 1` }).from(publicServices).where(eq(publicServices.workspaceId, actor.workspaceId));
  await db.insert(publicServices).values({ workspaceId: actor.workspaceId, position: next, ...data });
}

export async function deleteService(db: Executor, actor: Actor, id: string) {
  requireEditor(actor);
  await db.delete(publicServices).where(and(eq(publicServices.id, id), eq(publicServices.workspaceId, actor.workspaceId)));
}

/** Moves a card or room one place up (-1) or down (1). */
async function move(db: Executor, table: typeof publicServices | typeof publicRooms, actor: Actor, id: string, dir: -1 | 1) {
  requireEditor(actor);
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.workspaceId, actor.workspaceId)).orderBy(asc(table.position), asc(table.createdAt));
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (const [position, r] of rows.entries()) await db.update(table).set({ position }).where(eq(table.id, r.id));
}
export const moveService = (db: Executor, actor: Actor, id: string, dir: -1 | 1) => move(db, publicServices, actor, id, dir);
export const moveRoom = (db: Executor, actor: Actor, id: string, dir: -1 | 1) => move(db, publicRooms, actor, id, dir);

export const RoomInput = z.object({
  name: z.string().trim().min(1, "Name the room").max(80),
  notes: md(8_000),
  layoutId: z.string().max(64).nullable().default(null),
});

export async function saveRoom(db: Executor, actor: Actor, input: z.input<typeof RoomInput>, id?: string) {
  requireEditor(actor);
  await ensureSite(db, actor.workspaceId);
  const data = RoomInput.parse(input);
  if (data.layoutId) {
    const [l] = await db.select({ id: layouts.id }).from(layouts).where(and(eq(layouts.id, data.layoutId), eq(layouts.workspaceId, actor.workspaceId))).limit(1);
    if (!l) throw invalid("That room layout doesn't exist.");
  }
  if (id) {
    const [row] = await db.update(publicRooms).set({ ...data, updatedAt: new Date() }).where(and(eq(publicRooms.id, id), eq(publicRooms.workspaceId, actor.workspaceId))).returning({ id: publicRooms.id });
    if (!row) throw notFound("Room not found.");
    return;
  }
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${publicRooms.position}), -1)::int + 1` }).from(publicRooms).where(eq(publicRooms.workspaceId, actor.workspaceId));
  await db.insert(publicRooms).values({ workspaceId: actor.workspaceId, position: next, ...data });
}

export async function deleteRoom(db: Executor, actor: Actor, id: string) {
  requireEditor(actor);
  await db.delete(publicRooms).where(and(eq(publicRooms.id, id), eq(publicRooms.workspaceId, actor.workspaceId)));
}

export const GearPublicInput = z
  .object({
    show: z.boolean().default(false),
    name: z.string().trim().max(120).default(""),
    qty: z.number().int().min(1).max(9_999).default(1),
    note: z.string().trim().max(300).default(""),
    roomId: z.string().max(64).nullable().default(null),
    group: z.enum(GEAR_GROUPS.map(([k]) => k) as [GearGroup, ...GearGroup[]]).nullable().default(null),
  })
  .refine((g) => !g.show || (g.name && g.roomId), { message: "Give it a public name and a room to show it on the public page" });

/** Sets only the public fields of a gear item. */
export async function setGearPublic(db: Executor, actor: Actor, gearId: string, input: z.input<typeof GearPublicInput>) {
  requireEditor(actor);
  const data = GearPublicInput.parse(input);
  const [g] = await db.select({ id: gear.id, category: gear.category }).from(gear).where(and(eq(gear.id, gearId), eq(gear.workspaceId, actor.workspaceId))).limit(1);
  if (!g) throw notFound("Gear not found.");
  if (data.roomId) {
    const [r] = await db.select({ id: publicRooms.id }).from(publicRooms).where(and(eq(publicRooms.id, data.roomId), eq(publicRooms.workspaceId, actor.workspaceId))).limit(1);
    if (!r) throw invalid("That room doesn't exist.");
  }
  await db
    .update(gear)
    .set({ publicShow: data.show, publicName: data.name, publicQty: data.qty, publicNote: data.note, publicRoomId: data.roomId, publicGroup: data.group ?? groupFor(g.category), updatedAt: new Date() })
    .where(eq(gear.id, g.id));
}

/** Everything the Public site editor page needs. */
export async function siteForEditing(db: Executor, actor: Actor) {
  requireEditor(actor);
  await ensureSite(db, actor.workspaceId);
  const [text, services, rooms, items, plots] = await Promise.all([
    siteText(db, actor),
    publicServiceCards(db, actor),
    db.select().from(publicRooms).where(eq(publicRooms.workspaceId, actor.workspaceId)).orderBy(asc(publicRooms.position), asc(publicRooms.createdAt)),
    db
      .select({ id: gear.id, name: gear.name, category: gear.category, location: gear.location, show: gear.publicShow, publicName: gear.publicName, qty: gear.publicQty, note: gear.publicNote, roomId: gear.publicRoomId, group: gear.publicGroup })
      .from(gear)
      .where(eq(gear.workspaceId, actor.workspaceId))
      .orderBy(asc(gear.category), asc(gear.name)),
    db.select({ id: layouts.id, name: layouts.name, project: projects.name }).from(layouts).innerJoin(projects, eq(projects.id, layouts.projectId)).where(eq(layouts.workspaceId, actor.workspaceId)).orderBy(asc(projects.name), asc(layouts.name)),
  ]);
  return {
    text,
    services,
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, notes: r.notes, layoutId: r.layoutId })),
    gear: items.map((g) => ({ ...g, group: isGearGroup(g.group) ? g.group : groupFor(g.category) })),
    layouts: plots,
  };
}
export type SiteForEditing = Awaited<ReturnType<typeof siteForEditing>>;

/** A gear item's public settings and the rooms to choose from, for the gear item's own page. */
export async function gearPublicSettings(db: Executor, actor: Actor, gearId: string) {
  requireEditor(actor);
  await ensureSite(db, actor.workspaceId);
  const [g] = await db
    .select({ id: gear.id, name: gear.name, category: gear.category, location: gear.location, show: gear.publicShow, publicName: gear.publicName, qty: gear.publicQty, note: gear.publicNote, roomId: gear.publicRoomId, group: gear.publicGroup })
    .from(gear)
    .where(and(eq(gear.id, gearId), eq(gear.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!g) throw notFound("Gear not found.");
  const rooms = await db.select({ id: publicRooms.id, name: publicRooms.name, notes: publicRooms.notes, layoutId: publicRooms.layoutId }).from(publicRooms).where(eq(publicRooms.workspaceId, actor.workspaceId)).orderBy(asc(publicRooms.position), asc(publicRooms.createdAt));
  return { item: { ...g, group: isGearGroup(g.group) ? g.group : groupFor(g.category) }, rooms };
}
