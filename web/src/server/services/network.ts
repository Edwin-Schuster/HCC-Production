import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { networkPorts, projects } from "@/db/schema";
import { notFound } from "@/server/errors";
import type { Actor } from "@/server/permissions";
import { logActivity } from "./activity";
import { loadProject, requireEditor } from "./projects";

/**
 * Where a set of ports lives: a project's plan, or (projectId null) the church's own network in the Network
 * section. Returns the filter for its rows and a way to note changes in the project's activity.
 */
async function scope(db: Executor, actor: Actor, projectId: string | null) {
  if (projectId === null) {
    requireEditor(actor, "the network");
    const where: SQL = and(eq(networkPorts.workspaceId, actor.workspaceId), isNull(networkPorts.projectId))!;
    return { projectId: null, where, note: async (_tx: Executor, _text: string) => {} };
  }
  const project = await loadProject(db, actor, projectId);
  const where: SQL = eq(networkPorts.projectId, project.id);
  return {
    projectId: project.id as string | null,
    where,
    note: (tx: Executor, text: string) => logActivity(tx, actor, { projectId: project.id, targetType: "project", targetId: project.id, targetName: project.name, text }),
  };
}

/**
 * A project's network plan (or the church's own): each switch's ports (and Wi-Fi devices) with VLAN, reserved IP, device and MAC.
 * Rows keep the order they were added or imported in (`position`), grouped by switch.
 */
export type NetworkPort = { id: string; switchName: string; port: string; vlan: string; ip: string; device: string; mac: string; length: string; notes: string; position: number };

const toPort = (r: typeof networkPorts.$inferSelect): NetworkPort => ({ id: r.id, switchName: r.switchName, port: r.port, vlan: r.vlan, ip: r.ip, device: r.device, mac: r.mac, length: r.length, notes: r.notes, position: r.position });

const t = (max: number) => z.string().trim().max(max).default("");
export const PortInput = z.object({
  switchName: z.string().trim().min(1, "Name the switch, or Wi-Fi").max(80),
  port: t(40),
  vlan: t(80),
  ip: t(60),
  device: t(160),
  mac: t(40),
  length: t(40),
  notes: t(1_000),
});

export async function listPorts(db: Executor, actor: Actor, projectId: string | null): Promise<NetworkPort[]> {
  const sc = await scope(db, actor, projectId);
  const rows = await db.select().from(networkPorts).where(sc.where).orderBy(asc(networkPorts.position), asc(networkPorts.createdAt));
  return rows.map(toPort);
}

export async function savePort(db: Executor, actor: Actor, projectId: string | null, input: z.input<typeof PortInput>, id?: string) {
  const sc = await scope(db, actor, projectId);
  const data = PortInput.parse(input);
  if (id) {
    const [row] = await db.update(networkPorts).set({ ...data, updatedAt: new Date() }).where(and(eq(networkPorts.id, id), sc.where)).returning();
    if (!row) throw notFound("Port not found.");
    return toPort(row);
  }
  // New rows go after the last row of their switch, so the switch stays together.
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${networkPorts.position}), -1)::int + 1` }).from(networkPorts).where(sc.where);
  const [row] = await db.insert(networkPorts).values({ workspaceId: actor.workspaceId, projectId: sc.projectId, position: next, ...data }).returning();
  await sc.note(db, `added ${data.switchName} ${data.port || data.device} to the network plan`);
  return toPort(row);
}

export async function deletePort(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "the network plan");
  const [row] = await db.delete(networkPorts).where(and(eq(networkPorts.id, id), eq(networkPorts.workspaceId, actor.workspaceId))).returning({ id: networkPorts.id });
  if (!row) throw notFound("Port not found.");
}

export async function renameSwitch(db: Executor, actor: Actor, projectId: string | null, from: string, to: string) {
  const sc = await scope(db, actor, projectId);
  const name = z.string().trim().min(1, "Name the switch").max(80).parse(to);
  await db.update(networkPorts).set({ switchName: name, updatedAt: new Date() }).where(and(sc.where, eq(networkPorts.switchName, from)));
}

export const ImportPortsInput = z.array(PortInput).max(5_000);

/**
 * Brings in a network sheet. Rows match existing ones by switch and port (Wi-Fi rows, which have no port, by
 * switch and device), so re-importing updates the plan instead of duplicating it.
 */
export async function importPorts(db: Executor, actor: Actor, projectId: string | null, input: z.input<typeof ImportPortsInput>) {
  const sc = await scope(db, actor, projectId);
  const rows = ImportPortsInput.parse(input);
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(networkPorts).where(sc.where).orderBy(asc(networkPorts.position));
    const key = (r: { switchName: string; port: string; device: string }) => `${r.switchName.toLowerCase()}|${r.port ? `p:${r.port.toLowerCase()}` : `d:${r.device.toLowerCase()}`}`;
    const pool = new Map<string, (typeof existing)[number][]>();
    for (const e of existing) pool.set(key(e), [...(pool.get(key(e)) ?? []), e]);
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let position = 0;
    for (const r of rows) {
      const match = pool.get(key(r))?.shift();
      if (match) {
        const same = (Object.keys(r) as (keyof typeof r)[]).every((k) => match[k] === r[k]) && match.position === position;
        if (same) unchanged++;
        else {
          await tx.update(networkPorts).set({ ...r, position, updatedAt: new Date() }).where(eq(networkPorts.id, match.id));
          updated++;
        }
      } else {
        await tx.insert(networkPorts).values({ workspaceId: actor.workspaceId, projectId: sc.projectId, position, ...r });
        created++;
      }
      position++;
    }
    // Rows added in the app (not from the sheet) keep their place after the imported ones.
    for (const left of [...pool.values()].flat()) await tx.update(networkPorts).set({ position: position++ }).where(eq(networkPorts.id, left.id));
    if (created || updated) await sc.note(tx, `imported the network plan (${created} added, ${updated} updated)`);
    return { created, updated, unchanged };
  });
}

/** Projects that have a network plan, to copy one into the church's network. */
export async function projectsWithNetwork(db: Executor, actor: Actor) {
  requireEditor(actor, "the network");
  return db
    .select({ id: projects.id, name: projects.name, ports: sql<number>`count(*)::int` })
    .from(networkPorts)
    .innerJoin(projects, eq(projects.id, networkPorts.projectId))
    .where(eq(networkPorts.workspaceId, actor.workspaceId))
    .groupBy(projects.id, projects.name)
    .orderBy(asc(projects.name));
}

/** Copies a project's network plan into the church's network (matched by switch and port, like an import). */
export async function copyProjectNetwork(db: Executor, actor: Actor, projectId: string) {
  const rows = await listPorts(db, actor, projectId);
  return importPorts(
    db,
    actor,
    null,
    rows.map(({ switchName, port, vlan, ip, device, mac, length, notes }) => ({ switchName, port, vlan, ip, device, mac, length, notes })),
  );
}
