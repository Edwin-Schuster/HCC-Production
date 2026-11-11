import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { networkPorts } from "@/db/schema";
import { notFound } from "@/server/errors";
import type { Actor } from "@/server/permissions";
import { logActivity } from "./activity";
import { loadProject, requireEditor } from "./projects";

/**
 * A project's network plan: each switch's ports (and Wi-Fi devices) with VLAN, reserved IP, device and MAC.
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

export async function listPorts(db: Executor, actor: Actor, projectId: string): Promise<NetworkPort[]> {
  await loadProject(db, actor, projectId);
  const rows = await db.select().from(networkPorts).where(eq(networkPorts.projectId, projectId)).orderBy(asc(networkPorts.position), asc(networkPorts.createdAt));
  return rows.map(toPort);
}

export async function savePort(db: Executor, actor: Actor, projectId: string, input: z.input<typeof PortInput>, id?: string) {
  const project = await loadProject(db, actor, projectId);
  const data = PortInput.parse(input);
  if (id) {
    const [row] = await db.update(networkPorts).set({ ...data, updatedAt: new Date() }).where(and(eq(networkPorts.id, id), eq(networkPorts.projectId, project.id))).returning();
    if (!row) throw notFound("Port not found.");
    return toPort(row);
  }
  // New rows go after the last row of their switch, so the switch stays together.
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${networkPorts.position}), -1)::int + 1` }).from(networkPorts).where(eq(networkPorts.projectId, project.id));
  const [row] = await db.insert(networkPorts).values({ workspaceId: actor.workspaceId, projectId: project.id, position: next, ...data }).returning();
  await logActivity(db, actor, { projectId: project.id, targetType: "project", targetId: project.id, targetName: project.name, text: `added ${data.switchName} ${data.port || data.device} to the network plan` });
  return toPort(row);
}

export async function deletePort(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "the network plan");
  const [row] = await db.delete(networkPorts).where(and(eq(networkPorts.id, id), eq(networkPorts.workspaceId, actor.workspaceId))).returning({ id: networkPorts.id });
  if (!row) throw notFound("Port not found.");
}

export async function renameSwitch(db: Executor, actor: Actor, projectId: string, from: string, to: string) {
  const project = await loadProject(db, actor, projectId);
  const name = z.string().trim().min(1, "Name the switch").max(80).parse(to);
  await db.update(networkPorts).set({ switchName: name, updatedAt: new Date() }).where(and(eq(networkPorts.projectId, project.id), eq(networkPorts.switchName, from)));
}

export const ImportPortsInput = z.array(PortInput).max(5_000);

/**
 * Brings in a network sheet. Rows match existing ones by switch and port (Wi-Fi rows, which have no port, by
 * switch and device), so re-importing updates the plan instead of duplicating it.
 */
export async function importPorts(db: Executor, actor: Actor, projectId: string, input: z.input<typeof ImportPortsInput>) {
  const project = await loadProject(db, actor, projectId);
  const rows = ImportPortsInput.parse(input);
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(networkPorts).where(eq(networkPorts.projectId, project.id)).orderBy(asc(networkPorts.position));
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
        await tx.insert(networkPorts).values({ workspaceId: actor.workspaceId, projectId: project.id, position, ...r });
        created++;
      }
      position++;
    }
    // Rows added in the app (not from the sheet) keep their place after the imported ones.
    for (const left of [...pool.values()].flat()) await tx.update(networkPorts).set({ position: position++ }).where(eq(networkPorts.id, left.id));
    if (created || updated) await logActivity(tx, actor, { projectId: project.id, targetType: "project", targetId: project.id, targetName: project.name, text: `imported the network plan (${created} added, ${updated} updated)` });
    return { created, updated, unchanged };
  });
}
