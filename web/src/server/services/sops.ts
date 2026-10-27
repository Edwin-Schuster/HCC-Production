import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { alias } from "drizzle-orm/pg-core";
import { blocks, docCodeCounters, folders, sops, sopVersions, teamRoles, templates, users } from "@/db/schema";
import { DocumentSchema, type BlockNode } from "@/blocks/schema";
import { blockText, buildTree, cloneWithNewIds, flatten, instantiate } from "@/blocks/tree";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import {
  atLeast,
  canCreateSop,
  canEditSop,
  canManageSop,
  canPublishSop,
  canReadDrafts,
  canReadSop,
  type Actor,
  type Visibility,
} from "@/server/permissions";
import { audit } from "./audit";
import { requireFolder } from "./folders";

export type SopStatus = (typeof sops.$inferSelect)["status"];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const Tags = z
  .array(z.string().trim().toLowerCase().min(1).max(40).regex(/^[\p{L}\p{N} _-]+$/u, "Tags can use letters, numbers, spaces, - and _"))
  .max(20)
  .transform((t) => [...new Set(t)]);

export const CreateSopInput = z.object({
  title: z.string().trim().min(1, "Give the SOP a title").max(200),
  folderId: z.string().min(1, "Pick a folder").max(64),
  templateKey: z.string().max(64).optional(),
  summary: z.string().trim().max(1_000).default(""),
  tags: Tags.default([]),
  ownerId: z.string().max(64).optional(),
  reviewIntervalDays: z.number().int().min(7).max(3_650).default(365),
});

export const SaveDraftInput = z.object({
  title: z.string().trim().min(1, "Title can't be empty").max(200),
  summary: z.string().trim().max(1_000).default(""),
  blocks: DocumentSchema,
  /** The draft's updatedAt the client last saw. A newer server copy means someone else saved. */
  baseUpdatedAt: z.string().datetime().nullable().optional(),
  /** When no draft exists yet: the published version the client started from. */
  baseVersionId: z.string().max(64).nullable().optional(),
  force: z.boolean().optional(),
});

export const PublishInput = z.object({
  changeSummary: z.string().trim().min(3, "Describe what changed (at least 3 characters)").max(2_000),
});

export const UpdateMetaInput = z.object({
  ownerId: z.string().max(64).optional(),
  folderId: z.string().max(64).optional(),
  tags: Tags.optional(),
  reviewIntervalDays: z.number().int().min(7).max(3_650).optional(),
});

// ---------------------------------------------------------------------------
// Loading helpers
// ---------------------------------------------------------------------------

type SopRow = typeof sops.$inferSelect;
type VersionRow = typeof sopVersions.$inferSelect;

async function loadSop(db: Executor, actor: Actor, sopId: string, opts: { forUpdate?: boolean } = {}) {
  const q = db
    .select({ sop: sops, visibility: folders.visibility, folderName: folders.name })
    .from(sops)
    .innerJoin(folders, eq(folders.id, sops.folderId))
    .where(and(eq(sops.id, sopId), eq(sops.workspaceId, actor.workspaceId)))
    .limit(1);
  const [row] = opts.forUpdate ? await q.for("update", { of: sops }) : await q;
  if (!row || !canReadSop(actor, row.sop, row.visibility)) throw notFound("SOP not found.");
  return row as { sop: SopRow; visibility: Visibility; folderName: string };
}

export async function loadBlocks(db: Executor, versionId: string): Promise<BlockNode[]> {
  const rows = await db.select().from(blocks).where(eq(blocks.versionId, versionId)).orderBy(asc(blocks.position));
  return buildTree(rows, (r) => ({ id: r.id, key: r.key, type: r.type as BlockNode["type"], content: r.content as never }));
}

async function draftOf(db: Executor, sopId: string): Promise<VersionRow | undefined> {
  const [v] = await db.select().from(sopVersions).where(and(eq(sopVersions.sopId, sopId), isNull(sopVersions.publishedAt))).limit(1);
  return v;
}

function blockRows(versionId: string, tree: BlockNode[]) {
  return flatten(tree).map((f) => {
    const n = f.node;
    const step = n.type === "step" ? n.content : null;
    return {
      id: f.id,
      versionId,
      key: f.key,
      parentId: f.parentId,
      position: f.position,
      type: n.type,
      content: n.content,
      roleId: step?.roleId ?? null,
      estDuration: step?.estDuration ?? null,
      expectedResult: step?.expectedResult || null,
      warning: step?.warning || null,
      searchText: blockText(n).slice(0, 20_000),
    };
  });
}

async function writeBlocks(db: Executor, versionId: string, tree: BlockNode[]) {
  await db.delete(blocks).where(eq(blocks.versionId, versionId));
  const rows = blockRows(versionId, tree);
  for (let i = 0; i < rows.length; i += 500) await db.insert(blocks).values(rows.slice(i, i + 500));
}

const keywords = (code: string, tags: string[]) => [code, ...tags].join(" ");

async function nextDocumentCode(db: Executor, workspaceId: string, prefix: string): Promise<string> {
  const [row] = await db
    .insert(docCodeCounters)
    .values({ workspaceId, prefix, nextValue: 2 })
    .onConflictDoUpdate({ target: [docCodeCounters.workspaceId, docCodeCounters.prefix], set: { nextValue: sql`${docCodeCounters.nextValue} + 1` } })
    .returning({ nextValue: docCodeCounters.nextValue });
  return `SOP-${prefix}-${String(row.nextValue - 1).padStart(3, "0")}`;
}

async function requireMember(db: Executor, actor: Actor, userId: string) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw invalid("That owner doesn't exist.");
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type SopSummary = {
  id: string;
  documentCode: string;
  title: string;
  summary: string;
  status: SopStatus;
  tags: string[];
  folderId: string;
  folderName: string;
  ownerId: string;
  ownerName: string;
  versionNumber: number | null;
  effectiveAt: string | null;
  nextReviewAt: string | null;
  hasDraft: boolean;
  updatedAt: string;
};

export const ListSopsInput = z.object({
  folderIds: z.array(z.string()).optional(),
  tag: z.string().optional(),
  status: z.enum(["draft", "in_review", "approved", "published", "retired"]).optional(),
  ownerId: z.string().optional(),
});

export async function listSops(db: Executor, actor: Actor, input: z.input<typeof ListSopsInput> = {}): Promise<SopSummary[]> {
  const f = ListSopsInput.parse(input);
  const current = alias(sopVersions, "current");
  const conds = [eq(sops.workspaceId, actor.workspaceId)];
  if (f.folderIds?.length) conds.push(inArray(sops.folderId, f.folderIds));
  if (f.tag) conds.push(sql`${sops.tags} @> array[${f.tag}]::text[]`);
  if (f.status) conds.push(eq(sops.status, f.status));
  if (f.ownerId) conds.push(eq(sops.ownerId, f.ownerId));
  const rows = await db
    .select({
      sop: sops,
      visibility: folders.visibility,
      folderName: folders.name,
      ownerName: users.name,
      versionNumber: current.versionNumber,
      publishedAt: current.publishedAt,
      hasDraft: sql<boolean>`exists (select 1 from ${sopVersions} d where d.sop_id = ${sops.id} and d.published_at is null)`,
    })
    .from(sops)
    .innerJoin(folders, eq(folders.id, sops.folderId))
    .innerJoin(users, eq(users.id, sops.ownerId))
    .leftJoin(current, eq(current.id, sops.currentVersionId))
    .where(and(...conds))
    .orderBy(asc(sops.title));
  return rows
    .filter((r) => canReadSop(actor, r.sop, r.visibility))
    .map((r) => ({
      id: r.sop.id,
      documentCode: r.sop.documentCode,
      title: r.sop.title,
      summary: r.sop.summary,
      status: r.sop.status,
      tags: r.sop.tags,
      folderId: r.sop.folderId,
      folderName: r.folderName,
      ownerId: r.sop.ownerId,
      ownerName: r.ownerName,
      versionNumber: r.versionNumber ?? null,
      effectiveAt: r.publishedAt?.toISOString() ?? null,
      nextReviewAt: r.sop.nextReviewAt?.toISOString() ?? null,
      hasDraft: canReadDrafts(actor) && Boolean(r.hasDraft),
      updatedAt: r.sop.updatedAt.toISOString(),
    }));
}

export type SopDocument = {
  sop: SopSummary & { reviewIntervalDays: number; currentVersionId: string | null };
  version: {
    id: string;
    number: number | null;
    title: string;
    summary: string;
    isDraft: boolean;
    publishedAt: string | null;
    publishedByName: string | null;
    changeSummary: string | null;
    updatedAt: string;
  };
  blocks: BlockNode[];
  roles: Record<string, string>;
  canEdit: boolean;
  canManage: boolean;
};

/**
 * The document a reader sees. `version`: a published version number, "draft" (editors only),
 * or omitted for the current published version (editors fall back to the draft if never published).
 */
export async function getSopDocument(db: Executor, actor: Actor, sopId: string, version?: number | "draft"): Promise<SopDocument> {
  const { sop, visibility, folderName } = await loadSop(db, actor, sopId);
  let v: VersionRow | undefined;
  if (version === "draft") {
    if (!canReadDrafts(actor)) throw forbidden("Only editors can see drafts.");
    v = await draftOf(db, sop.id);
  } else if (typeof version === "number") {
    [v] = await db.select().from(sopVersions).where(and(eq(sopVersions.sopId, sop.id), eq(sopVersions.versionNumber, version), isNotNull(sopVersions.publishedAt))).limit(1);
  } else if (sop.currentVersionId) {
    [v] = await db.select().from(sopVersions).where(eq(sopVersions.id, sop.currentVersionId)).limit(1);
  } else if (canReadDrafts(actor)) {
    v = await draftOf(db, sop.id);
  }
  if (!v) throw notFound(version === "draft" ? "This SOP has no draft." : "That version doesn't exist.");

  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, sop.ownerId)).limit(1);
  const [publisher] = v.publishedBy ? await db.select({ name: users.name }).from(users).where(eq(users.id, v.publishedBy)).limit(1) : [];
  const [current] = sop.currentVersionId ? await db.select().from(sopVersions).where(eq(sopVersions.id, sop.currentVersionId)).limit(1) : [];
  const hasDraft = canReadDrafts(actor) && Boolean(await draftOf(db, sop.id));
  const roleRows = await db.select({ id: teamRoles.id, name: teamRoles.name }).from(teamRoles).where(eq(teamRoles.workspaceId, actor.workspaceId));

  return {
    sop: {
      id: sop.id,
      documentCode: sop.documentCode,
      title: sop.title,
      summary: sop.summary,
      status: sop.status,
      tags: sop.tags,
      folderId: sop.folderId,
      folderName,
      ownerId: sop.ownerId,
      ownerName: owner?.name ?? "Unknown",
      versionNumber: current?.versionNumber ?? null,
      effectiveAt: current?.publishedAt?.toISOString() ?? null,
      nextReviewAt: sop.nextReviewAt?.toISOString() ?? null,
      hasDraft,
      updatedAt: sop.updatedAt.toISOString(),
      reviewIntervalDays: sop.reviewIntervalDays,
      currentVersionId: sop.currentVersionId,
    },
    version: {
      id: v.id,
      number: v.versionNumber,
      title: v.title,
      summary: v.summary,
      isDraft: v.publishedAt === null,
      publishedAt: v.publishedAt?.toISOString() ?? null,
      publishedByName: publisher?.name ?? null,
      changeSummary: v.changeSummary,
      updatedAt: v.updatedAt.toISOString(),
    },
    blocks: await loadBlocks(db, v.id),
    roles: Object.fromEntries(roleRows.map((r) => [r.id, r.name])),
    canEdit: canEditSop(actor, sop, visibility),
    canManage: canManageSop(actor, sop),
  };
}

export async function listVersions(db: Executor, actor: Actor, sopId: string) {
  const { sop } = await loadSop(db, actor, sopId);
  const rows = await db
    .select({ v: sopVersions, publisher: users.name })
    .from(sopVersions)
    .leftJoin(users, eq(users.id, sopVersions.publishedBy))
    .where(and(eq(sopVersions.sopId, sop.id), isNotNull(sopVersions.publishedAt)))
    .orderBy(desc(sopVersions.versionNumber));
  return rows.map(({ v, publisher }) => ({
    id: v.id,
    number: v.versionNumber!,
    title: v.title,
    publishedAt: v.publishedAt!.toISOString(),
    publishedByName: publisher ?? "Unknown",
    changeSummary: v.changeSummary ?? "",
    isCurrent: v.id === sop.currentVersionId,
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createSop(db: Executor, actor: Actor, input: z.input<typeof CreateSopInput>) {
  if (!canCreateSop(actor)) throw forbidden("Only editors can create SOPs.");
  const data = CreateSopInput.parse(input);
  const folder = await requireFolder(db, actor, data.folderId);
  const ownerId = data.ownerId ?? actor.userId!;
  await requireMember(db, actor, ownerId);

  let tree: BlockNode[] = [];
  let templateId: string | null = null;
  if (data.templateKey) {
    const [tpl] = await db.select().from(templates).where(and(eq(templates.workspaceId, actor.workspaceId), eq(templates.key, data.templateKey))).limit(1);
    if (!tpl) throw invalid("That template doesn't exist.");
    templateId = tpl.id;
    tree = instantiate(DocumentSchema.parse(tpl.blocks));
  }

  return db.transaction(async (tx) => {
    const documentCode = await nextDocumentCode(tx, actor.workspaceId, folder.codePrefix);
    const [sop] = await tx
      .insert(sops)
      .values({
        workspaceId: actor.workspaceId,
        documentCode,
        title: data.title,
        summary: data.summary,
        ownerId,
        folderId: folder.id,
        templateId,
        tags: data.tags,
        searchKeywords: keywords(documentCode, data.tags),
        reviewIntervalDays: data.reviewIntervalDays,
        createdBy: actor.userId,
      })
      .returning();
    const [draft] = await tx.insert(sopVersions).values({ sopId: sop.id, title: data.title, summary: data.summary, updatedBy: actor.userId }).returning();
    await writeBlocks(tx, draft.id, tree);
    await audit(tx, actor, "sop.created", { type: "sop", id: sop.id }, { documentCode, template: data.templateKey ?? null });
    return { id: sop.id, documentCode, draftVersionId: draft.id };
  });
}

/** Returns the open draft, creating one from the current published version if needed. */
export async function getOrCreateDraft(db: Executor, actor: Actor, sopId: string) {
  const { sop, visibility } = await loadSop(db, actor, sopId);
  if (!canEditSop(actor, sop, visibility)) throw forbidden(sop.status === "retired" ? "Restore this SOP before editing it." : "You can't edit this SOP.");
  const existing = await draftOf(db, sop.id);
  if (existing) return { draft: existing, blocks: await loadBlocks(db, existing.id), created: false };
  return db.transaction(async (tx) => {
    const again = await draftOf(tx, sop.id);
    if (again) return { draft: again, blocks: await loadBlocks(tx, again.id), created: false };
    const [current] = sop.currentVersionId ? await tx.select().from(sopVersions).where(eq(sopVersions.id, sop.currentVersionId)).limit(1) : [];
    const source = current ? await loadBlocks(tx, current.id) : [];
    const copy = cloneWithNewIds(source);
    const [draft] = await tx
      .insert(sopVersions)
      .values({ sopId: sop.id, title: current?.title ?? sop.title, summary: current?.summary ?? sop.summary, updatedBy: actor.userId })
      .returning();
    await writeBlocks(tx, draft.id, copy);
    return { draft, blocks: copy, created: true };
  });
}

export type EditorState = {
  draftExists: boolean;
  draftUpdatedAt: string | null;
  baseVersionId: string | null;
  baseVersionNumber: number | null;
  title: string;
  summary: string;
  blocks: BlockNode[];
};

/** What the editor opens with. Reads only: the draft is created by the first save. */
export async function getEditorState(db: Executor, actor: Actor, sopId: string): Promise<EditorState> {
  const { sop, visibility } = await loadSop(db, actor, sopId);
  if (!canEditSop(actor, sop, visibility)) throw forbidden(sop.status === "retired" ? "Restore this SOP before editing it." : "You can't edit this SOP.");
  const draft = await draftOf(db, sop.id);
  const [current] = sop.currentVersionId ? await db.select().from(sopVersions).where(eq(sopVersions.id, sop.currentVersionId)).limit(1) : [];
  if (draft) {
    return { draftExists: true, draftUpdatedAt: draft.updatedAt.toISOString(), baseVersionId: sop.currentVersionId, baseVersionNumber: current?.versionNumber ?? null, title: draft.title, summary: draft.summary, blocks: await loadBlocks(db, draft.id) };
  }
  return {
    draftExists: false,
    draftUpdatedAt: null,
    baseVersionId: sop.currentVersionId,
    baseVersionNumber: current?.versionNumber ?? null,
    title: current?.title ?? sop.title,
    summary: current?.summary ?? sop.summary,
    blocks: current ? cloneWithNewIds(await loadBlocks(db, current.id)) : [],
  };
}

export async function saveDraft(db: Executor, actor: Actor, sopId: string, input: z.input<typeof SaveDraftInput>) {
  const data = SaveDraftInput.parse(input);
  return db.transaction(async (tx) => {
    const { sop, visibility } = await loadSop(tx, actor, sopId, { forUpdate: true });
    if (!canEditSop(actor, sop, visibility)) throw forbidden("You can't edit this SOP.");
    let draft = await draftOf(tx, sop.id);
    if (!draft) {
      // The editor opens on the published version without creating a draft; the first save creates it,
      // unless the client was editing an older draft (now published or discarded) or an outdated version.
      if (data.baseUpdatedAt && !data.force) throw conflict("This draft was published or discarded by someone else. Reload to start a new draft.", { reason: "no_draft" });
      if (!data.force && (data.baseVersionId ?? null) !== sop.currentVersionId) throw conflict("A newer version was published after you started editing. Reload to edit the latest version.", { reason: "outdated" });
      [draft] = await tx.insert(sopVersions).values({ sopId: sop.id, title: data.title, summary: data.summary, updatedBy: actor.userId }).returning();
    } else if (data.baseUpdatedAt && !data.force && draft.updatedAt.getTime() > new Date(data.baseUpdatedAt).getTime() + 1) {
      throw conflict("Someone else saved this draft after you opened it.", { reason: "stale", serverUpdatedAt: draft.updatedAt.toISOString(), updatedBy: draft.updatedBy });
    }
    await writeBlocks(tx, draft.id, data.blocks);
    const now = new Date();
    const [saved] = await tx
      .update(sopVersions)
      .set({ title: data.title, summary: data.summary, updatedAt: now, updatedBy: actor.userId })
      .where(eq(sopVersions.id, draft.id))
      .returning({ updatedAt: sopVersions.updatedAt });
    // A never-published SOP shows its working title in the library.
    if (!sop.currentVersionId) await tx.update(sops).set({ title: data.title, summary: data.summary, updatedAt: now }).where(eq(sops.id, sop.id));
    return { updatedAt: saved.updatedAt.toISOString() };
  });
}

/** Freezes the draft as the next version. Published versions can never change afterwards. */
export async function publishDraft(db: Executor, actor: Actor, sopId: string, input: z.input<typeof PublishInput>) {
  const { changeSummary } = PublishInput.parse(input);
  return db.transaction(async (tx) => {
    const { sop, visibility } = await loadSop(tx, actor, sopId, { forUpdate: true });
    if (!canPublishSop(actor, sop, visibility)) throw forbidden("You can't publish this SOP.");
    const draft = await draftOf(tx, sop.id);
    if (!draft) throw invalid("There is no draft to publish.");
    const tree = await loadBlocks(tx, draft.id);
    if (!tree.length) throw invalid("Add some content before publishing.");
    DocumentSchema.parse(tree); // never freeze invalid content

    const [{ max }] = await tx.select({ max: sql<number | null>`max(${sopVersions.versionNumber})` }).from(sopVersions).where(eq(sopVersions.sopId, sop.id));
    const number = Number(max ?? 0) + 1;
    const now = new Date();
    await tx
      .update(sopVersions)
      .set({ versionNumber: number, publishedAt: now, publishedBy: actor.userId, changeSummary, updatedAt: now })
      .where(and(eq(sopVersions.id, draft.id), isNull(sopVersions.publishedAt)));
    await tx
      .update(sops)
      .set({
        currentVersionId: draft.id,
        status: "published",
        title: draft.title,
        summary: draft.summary,
        nextReviewAt: new Date(now.getTime() + sop.reviewIntervalDays * 864e5),
        updatedAt: now,
      })
      .where(eq(sops.id, sop.id));
    await audit(tx, actor, "sop.published", { type: "sop", id: sop.id }, { versionId: draft.id, versionNumber: number, changeSummary });
    return { versionId: draft.id, versionNumber: number };
  });
}

export async function discardDraft(db: Executor, actor: Actor, sopId: string) {
  return db.transaction(async (tx) => {
    const { sop, visibility } = await loadSop(tx, actor, sopId, { forUpdate: true });
    if (!canEditSop(actor, sop, visibility)) throw forbidden("You can't edit this SOP.");
    if (!sop.currentVersionId) throw invalid("This SOP has never been published. Delete it instead.");
    const draft = await draftOf(tx, sop.id);
    if (!draft) return;
    await tx.delete(sopVersions).where(eq(sopVersions.id, draft.id));
    await audit(tx, actor, "sop.draft_discarded", { type: "sop", id: sop.id });
  });
}

export async function updateSopMeta(db: Executor, actor: Actor, sopId: string, input: z.input<typeof UpdateMetaInput>) {
  const data = UpdateMetaInput.parse(input);
  return db.transaction(async (tx) => {
    const { sop, visibility } = await loadSop(tx, actor, sopId, { forUpdate: true });
    if (!canEditSop(actor, sop, visibility)) throw forbidden("You can't edit this SOP.");
    if (data.ownerId && data.ownerId !== sop.ownerId) {
      if (!canManageSop(actor, sop)) throw forbidden("Only the owner or an admin can hand over ownership.");
      await requireMember(tx, actor, data.ownerId);
    }
    if (data.folderId && data.folderId !== sop.folderId) await requireFolder(tx, actor, data.folderId);
    const tags = data.tags ?? sop.tags;
    const interval = data.reviewIntervalDays ?? sop.reviewIntervalDays;
    const current = sop.currentVersionId ? (await tx.select().from(sopVersions).where(eq(sopVersions.id, sop.currentVersionId)).limit(1))[0] : undefined;
    const nextReviewAt = current?.publishedAt && data.reviewIntervalDays ? new Date(current.publishedAt.getTime() + interval * 864e5) : sop.nextReviewAt;
    const changes = Object.fromEntries(
      Object.entries({ ownerId: data.ownerId, folderId: data.folderId, tags: data.tags, reviewIntervalDays: data.reviewIntervalDays }).filter(
        ([k, v]) => v !== undefined && JSON.stringify(v) !== JSON.stringify(sop[k as keyof SopRow]),
      ),
    );
    if (!Object.keys(changes).length) return;
    await tx
      .update(sops)
      .set({ ...changes, searchKeywords: keywords(sop.documentCode, tags), nextReviewAt, updatedAt: new Date() })
      .where(eq(sops.id, sop.id));
    await audit(tx, actor, "sop.metadata_updated", { type: "sop", id: sop.id }, { changes, published: Boolean(sop.currentVersionId) });
  });
}

export async function setRetired(db: Executor, actor: Actor, sopId: string, retired: boolean) {
  return db.transaction(async (tx) => {
    const { sop } = await loadSop(tx, actor, sopId, { forUpdate: true });
    if (!canManageSop(actor, sop)) throw forbidden("Only the owner or an admin can retire an SOP.");
    const status = retired ? "retired" : sop.currentVersionId ? "published" : "draft";
    await tx.update(sops).set({ status, updatedAt: new Date() }).where(eq(sops.id, sop.id));
    await audit(tx, actor, retired ? "sop.retired" : "sop.restored", { type: "sop", id: sop.id });
  });
}

export async function deleteSop(db: Executor, actor: Actor, sopId: string) {
  return db.transaction(async (tx) => {
    const { sop } = await loadSop(tx, actor, sopId, { forUpdate: true });
    if (!canManageSop(actor, sop)) throw forbidden("Only the owner or an admin can delete an SOP.");
    if (sop.currentVersionId) throw invalid("Published SOPs can't be deleted, because their history must be kept. Retire it instead.");
    await tx.delete(sops).where(eq(sops.id, sop.id));
    await audit(tx, actor, "sop.deleted", { type: "sop", id: sop.id }, { documentCode: sop.documentCode, title: sop.title });
  });
}

// ---------------------------------------------------------------------------
// Lookups for forms
// ---------------------------------------------------------------------------

export async function listTemplates(db: Executor, actor: Actor) {
  return db
    .select({ key: templates.key, name: templates.name, description: templates.description })
    .from(templates)
    .where(eq(templates.workspaceId, actor.workspaceId))
    .orderBy(asc(templates.position));
}

export async function listTeamRoles(db: Executor, actor: Actor) {
  return db.select({ id: teamRoles.id, name: teamRoles.name }).from(teamRoles).where(eq(teamRoles.workspaceId, actor.workspaceId)).orderBy(asc(teamRoles.name));
}

export async function listAllTags(db: Executor, actor: Actor): Promise<string[]> {
  const rows = await db.selectDistinct({ tag: sql<string>`unnest(${sops.tags})` }).from(sops).where(eq(sops.workspaceId, actor.workspaceId));
  return rows.map((r) => r.tag).sort();
}

export const isEditor = (actor: Actor) => atLeast(actor, "editor");
