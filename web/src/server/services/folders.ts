import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { folders, sops } from "@/db/schema";
import { forbidden, invalid, notFound } from "@/server/errors";
import { canManageFolders, canViewFolder, type Actor, type Visibility } from "@/server/permissions";
import { audit } from "./audit";

export type FolderView = {
  id: string;
  name: string;
  parentId: string | null;
  codePrefix: string;
  visibility: Visibility;
  position: number;
  /** Approvals a draft needs before it can be published (this folder's own setting). */
  requiredApprovals: number;
  /** Top-level ancestor, used as the "department" filter. */
  departmentId: string;
  depth: number;
};

/** Folders the actor can see, ordered as a tree (parents before children). */
export async function listFolders(db: Executor, actor: Actor): Promise<FolderView[]> {
  const rows = await db.select().from(folders).where(eq(folders.workspaceId, actor.workspaceId)).orderBy(asc(folders.position), asc(folders.name));
  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) {
    const k = r.parentId ?? null;
    byParent.set(k, [...(byParent.get(k) ?? []), r]);
  }
  const out: FolderView[] = [];
  const visit = (parentId: string | null, depth: number, dept: string | null) => {
    for (const r of byParent.get(parentId) ?? []) {
      if (!canViewFolder(actor, r.visibility)) continue; // hidden folders hide their subtree too
      const departmentId = dept ?? r.id;
      out.push({ id: r.id, name: r.name, parentId: r.parentId, codePrefix: r.codePrefix, visibility: r.visibility, requiredApprovals: r.requiredApprovals, position: r.position, departmentId, depth });
      visit(r.id, depth + 1, departmentId);
    }
  };
  visit(null, 0, null);
  return out;
}

export function descendantIds(all: FolderView[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of all) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

export const FolderInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  codePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/, "Code prefix must be 2–8 letters or digits, like AUD"),
  visibility: z.enum(["public", "members", "editors"]).default("members"),
  parentId: z.string().max(64).nullable().default(null),
  requiredApprovals: z.number().int().min(0).max(5).default(0),
});

/** A folder needs the most approvals asked for by it or any folder it sits inside. */
export async function effectiveRequiredApprovals(db: Executor, folderId: string): Promise<number> {
  let required = 0;
  let id: string | null = folderId;
  for (let depth = 0; id && depth < 20; depth++) {
    const [f]: { parentId: string | null; requiredApprovals: number }[] = await db.select({ parentId: folders.parentId, requiredApprovals: folders.requiredApprovals }).from(folders).where(eq(folders.id, id)).limit(1);
    if (!f) break;
    required = Math.max(required, f.requiredApprovals);
    id = f.parentId;
  }
  return required;
}

export async function createFolder(db: Executor, actor: Actor, input: z.input<typeof FolderInput>) {
  if (!canManageFolders(actor)) throw forbidden("Only admins can create folders.");
  const data = FolderInput.parse(input);
  if (data.parentId) await requireFolder(db, actor, data.parentId);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${folders.position}), -1)` })
    .from(folders)
    .where(and(eq(folders.workspaceId, actor.workspaceId), data.parentId ? eq(folders.parentId, data.parentId) : sql`${folders.parentId} is null`));
  const [row] = await db
    .insert(folders)
    .values({ ...data, workspaceId: actor.workspaceId, position: Number(max) + 1 })
    .returning();
  await audit(db, actor, "folder.created", { type: "folder", id: row.id }, { name: row.name });
  return row;
}

export async function updateFolder(db: Executor, actor: Actor, id: string, input: Partial<z.input<typeof FolderInput>>) {
  if (!canManageFolders(actor)) throw forbidden("Only admins can edit folders.");
  const existing = await requireFolder(db, actor, id);
  const data = FolderInput.partial().parse(input);
  if (data.parentId) {
    const all = await listFolders(db, actor);
    if (descendantIds(all, id).has(data.parentId)) throw invalid("A folder can't be moved inside itself.");
  }
  const [row] = await db.update(folders).set(data).where(eq(folders.id, existing.id)).returning();
  await audit(db, actor, "folder.updated", { type: "folder", id }, { changes: data });
  return row;
}

export async function deleteFolder(db: Executor, actor: Actor, id: string) {
  if (!canManageFolders(actor)) throw forbidden("Only admins can delete folders.");
  await requireFolder(db, actor, id);
  const [child] = await db.select({ id: folders.id }).from(folders).where(eq(folders.parentId, id)).limit(1);
  const [doc] = await db.select({ id: sops.id }).from(sops).where(eq(sops.folderId, id)).limit(1);
  if (child || doc) throw invalid("Move or delete the SOPs and sub-folders in this folder first.");
  await db.delete(folders).where(eq(folders.id, id));
  await audit(db, actor, "folder.deleted", { type: "folder", id });
}

export async function requireFolder(db: Executor, actor: Actor, id: string) {
  const [row] = await db.select().from(folders).where(and(eq(folders.id, id), eq(folders.workspaceId, actor.workspaceId))).limit(1);
  if (!row || !canViewFolder(actor, row.visibility)) throw notFound("Folder not found.");
  return row;
}
