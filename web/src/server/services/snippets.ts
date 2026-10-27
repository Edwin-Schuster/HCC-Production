import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { blocks, snippets, snippetVersions, sops, sopVersions } from "@/db/schema";
import { DocumentSchema, type BlockNode } from "@/blocks/schema";
import { snippetRefs, type SnippetResolver } from "@/blocks/snippets";
import { walk } from "@/blocks/tree";
import { forbidden, invalid, notFound } from "@/server/errors";
import { atLeast, type Actor } from "@/server/permissions";
import { audit } from "./audit";

export const SnippetInput = z.object({
  name: z.string().trim().min(1, "Give the snippet a name").max(120),
  description: z.string().trim().max(500).default(""),
  blocks: DocumentSchema.refine((tree) => ![...walk(tree)].some((x) => x.node.type === "snippet_ref"), "A snippet can't contain another snippet."),
});

const canEditSnippets = (actor: Actor) => atLeast(actor, "editor");

export type SnippetSummary = { id: string; name: string; description: string; currentVersion: number; updatedAt: string; usedBy: number };

export async function listSnippets(db: Executor, actor: Actor): Promise<SnippetSummary[]> {
  if (!canEditSnippets(actor)) throw forbidden("Only editors can manage snippets.");
  const rows = await db.select().from(snippets).where(eq(snippets.workspaceId, actor.workspaceId)).orderBy(asc(snippets.name));
  const usage = await usageCounts(db, actor.workspaceId);
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, currentVersion: r.currentVersion, updatedAt: r.updatedAt.toISOString(), usedBy: usage.get(r.id) ?? 0 }));
}

/** SOP ids whose current version or draft references each snippet. */
async function usage(db: Executor, workspaceId: string, snippetId?: string) {
  const rows = await db
    .selectDistinct({ snippetId: sql<string>`${blocks.content}->>'snippetId'`, sopId: sopVersions.sopId, published: isNotNull(sopVersions.publishedAt) })
    .from(blocks)
    .innerJoin(sopVersions, eq(sopVersions.id, blocks.versionId))
    .innerJoin(sops, eq(sops.id, sopVersions.sopId))
    .where(
      and(
        eq(sops.workspaceId, workspaceId),
        eq(blocks.type, "snippet_ref"),
        or(eq(sops.currentVersionId, sopVersions.id), isNull(sopVersions.publishedAt)),
        snippetId ? sql`${blocks.content}->>'snippetId' = ${snippetId}` : undefined,
      ),
    );
  return rows;
}

async function usageCounts(db: Executor, workspaceId: string) {
  const counts = new Map<string, Set<string>>();
  for (const r of await usage(db, workspaceId)) {
    const set = counts.get(r.snippetId) ?? new Set();
    set.add(r.sopId);
    counts.set(r.snippetId, set);
  }
  return new Map([...counts].map(([k, v]) => [k, v.size]));
}

export async function getSnippet(db: Executor, actor: Actor, id: string) {
  if (!canEditSnippets(actor)) throw forbidden("Only editors can manage snippets.");
  const [s] = await db.select().from(snippets).where(and(eq(snippets.id, id), eq(snippets.workspaceId, actor.workspaceId))).limit(1);
  if (!s) throw notFound("Snippet not found.");
  const [v] = await db.select().from(snippetVersions).where(and(eq(snippetVersions.snippetId, id), eq(snippetVersions.version, s.currentVersion))).limit(1);
  return { id: s.id, name: s.name, description: s.description, currentVersion: s.currentVersion, blocks: DocumentSchema.parse(v?.blocks ?? []), updatedAt: s.updatedAt.toISOString() };
}

export async function createSnippet(db: Executor, actor: Actor, input: z.input<typeof SnippetInput>) {
  if (!canEditSnippets(actor)) throw forbidden("Only editors can create snippets.");
  const data = SnippetInput.parse(input);
  return db.transaction(async (tx) => {
    const [s] = await tx.insert(snippets).values({ workspaceId: actor.workspaceId, name: data.name, description: data.description, createdBy: actor.userId }).returning();
    await tx.insert(snippetVersions).values({ snippetId: s.id, version: 1, blocks: data.blocks, createdBy: actor.userId });
    await audit(tx, actor, "snippet.created", { type: "snippet", id: s.id }, { name: data.name });
    return { id: s.id };
  });
}

/**
 * Saves a new version. Published SOPs that follow the latest version change with it,
 * so each of them gets an audit event naming the snippet version they now show.
 */
export async function updateSnippet(db: Executor, actor: Actor, id: string, input: z.input<typeof SnippetInput>) {
  if (!canEditSnippets(actor)) throw forbidden("Only editors can edit snippets.");
  const data = SnippetInput.parse(input);
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(snippets).where(and(eq(snippets.id, id), eq(snippets.workspaceId, actor.workspaceId))).for("update").limit(1);
    if (!s) throw notFound("Snippet not found.");
    const version = s.currentVersion + 1;
    await tx.insert(snippetVersions).values({ snippetId: s.id, version, blocks: data.blocks, createdBy: actor.userId });
    await tx.update(snippets).set({ name: data.name, description: data.description, currentVersion: version, updatedAt: new Date() }).where(eq(snippets.id, s.id));
    await audit(tx, actor, "snippet.updated", { type: "snippet", id: s.id }, { version });
    const affected = await followers(tx, s.id);
    for (const sopId of affected) await audit(tx, actor, "sop.snippet_updated", { type: "sop", id: sopId }, { snippetId: s.id, snippetName: data.name, snippetVersion: version });
    return { version, affectedSops: affected.length };
  });
}

/** Published SOPs whose current version shows the latest version of this snippet. */
async function followers(db: Executor, snippetId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ sopId: sops.id })
    .from(blocks)
    .innerJoin(sops, eq(sops.currentVersionId, blocks.versionId))
    .where(and(eq(blocks.type, "snippet_ref"), sql`${blocks.content}->>'snippetId' = ${snippetId}`, sql`${blocks.content}->>'version' is null`));
  return rows.map((r) => r.sopId);
}

export async function deleteSnippet(db: Executor, actor: Actor, id: string) {
  if (!atLeast(actor, "admin")) throw forbidden("Only admins can delete snippets.");
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(snippets).where(and(eq(snippets.id, id), eq(snippets.workspaceId, actor.workspaceId))).limit(1);
    if (!s) throw notFound("Snippet not found.");
    const used = await usage(tx, actor.workspaceId, id);
    if (used.length) throw invalid(`This snippet is used by ${new Set(used.map((u) => u.sopId)).size} SOP(s). Remove it from them first.`);
    await tx.delete(snippets).where(eq(snippets.id, id));
    await audit(tx, actor, "snippet.deleted", { type: "snippet", id }, { name: s.name });
  });
}

/** Loads exactly the snippet versions a document needs and returns a resolver for expandSnippets. */
export async function snippetResolver(db: Executor, workspaceId: string, tree: BlockNode[]): Promise<SnippetResolver> {
  const refs = snippetRefs(tree);
  if (!refs.length) return () => null;
  const ids = [...new Set(refs.map((r) => r.snippetId))];
  const heads = await db.select().from(snippets).where(and(eq(snippets.workspaceId, workspaceId), inArray(snippets.id, ids)));
  const want = new Set<string>();
  for (const r of refs) {
    const head = heads.find((h) => h.id === r.snippetId);
    if (head) want.add(`${head.id}:${r.version ?? head.currentVersion}`);
  }
  const versions = want.size
    ? await db
        .select()
        .from(snippetVersions)
        .where(inArray(sql<string>`${snippetVersions.snippetId} || ':' || ${snippetVersions.version}`, [...want]))
    : [];
  return (snippetId, version) => {
    const head = heads.find((h) => h.id === snippetId);
    if (!head) return null;
    const v = version ?? head.currentVersion;
    const row = versions.find((x) => x.snippetId === snippetId && x.version === v);
    return row ? { name: head.name, version: v, blocks: DocumentSchema.parse(row.blocks) } : null;
  };
}

/** What the SOP editor needs to insert and preview snippets. */
export async function snippetCatalog(db: Executor, actor: Actor, tree: BlockNode[]) {
  if (!canEditSnippets(actor)) return [];
  const heads = await db.select().from(snippets).where(eq(snippets.workspaceId, actor.workspaceId)).orderBy(asc(snippets.name));
  if (!heads.length) return [];
  const pinned = snippetRefs(tree).filter((r) => r.version !== null);
  const keys = [...heads.map((h) => `${h.id}:${h.currentVersion}`), ...pinned.map((p) => `${p.snippetId}:${p.version}`)];
  const rows = await db
    .select()
    .from(snippetVersions)
    .where(inArray(sql<string>`${snippetVersions.snippetId} || ':' || ${snippetVersions.version}`, [...new Set(keys)]));
  return heads.map((h) => ({
    id: h.id,
    name: h.name,
    currentVersion: h.currentVersion,
    versions: Object.fromEntries(rows.filter((r) => r.snippetId === h.id).map((r) => [r.version, DocumentSchema.parse(r.blocks)])) as Record<number, BlockNode[]>,
  }));
}
