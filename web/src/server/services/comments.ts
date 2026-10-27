import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { comments, users, workspaceMembers, type Suggestion } from "@/db/schema";
import { rt } from "@/blocks/build";
import type { BlockNode } from "@/blocks/schema";
import { plain, walk } from "@/blocks/tree";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import { atLeast, canEditSop, type Actor } from "@/server/permissions";
import { audit } from "./audit";
import { notify } from "./notifications";
import { draftOf, getOrCreateDraft, loadBlocks, loadSop, saveDraft } from "./sops";

/**
 * Threaded comments on an SOP or one of its blocks (anchored by block key, so threads follow a step
 * across versions). A comment can carry a suggested edit to one text field, which an editor accepts
 * into the draft or rejects.
 */

export const SUGGESTABLE = {
  step: ["title", "description", "expectedResult", "warning"],
  text: ["text"],
  heading: ["text"],
  callout: ["text"],
  checklist: ["text"],
} as const;
type Field = Suggestion["field"];

/** The plain text of one editable field of a block. */
export function fieldText(node: BlockNode, field: Field): string | null {
  if (node.type === "step") {
    if (field === "title") return plain(node.content.title);
    if (field === "description" || field === "expectedResult" || field === "warning") return node.content[field];
    return null;
  }
  if ((node.type === "text" || node.type === "heading" || node.type === "callout" || node.type === "checklist") && field === "text") return plain(node.content.text);
  return null;
}

function withField(node: BlockNode, field: Field, value: string): BlockNode {
  if (node.type === "step") {
    if (field === "title") return { ...node, content: { ...node.content, title: rt(value) } };
    return { ...node, content: { ...node.content, [field]: value } };
  }
  return { ...node, content: { ...node.content, text: rt(value) } } as BlockNode;
}

function replaceByKey(tree: BlockNode[], key: string, fn: (n: BlockNode) => BlockNode): BlockNode[] {
  return tree.map((n) => (n.key === key ? fn(n) : ({ ...n, children: replaceByKey(n.children, key, fn) } as BlockNode)));
}

const findByKey = (tree: BlockNode[], key: string) => [...walk(tree)].find((x) => x.node.key === key)?.node;

/** The text people are reading or editing now: the draft if there is one, else the published version. */
async function workingTree(db: Executor, sop: { id: string; currentVersionId: string | null }) {
  const draft = await draftOf(db, sop.id);
  const versionId = draft?.id ?? sop.currentVersionId;
  return versionId ? loadBlocks(db, versionId) : [];
}

const MENTION = /(^|[^\w@])@([a-z0-9._-]{2,40})/gi;

async function resolveMentions(db: Executor, workspaceId: string, body: string): Promise<string[]> {
  const names = [...new Set([...body.matchAll(MENTION)].map((m) => m[2].toLowerCase()))].slice(0, 20);
  if (!names.length) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(workspaceMembers, and(eq(workspaceMembers.userId, users.id), eq(workspaceMembers.workspaceId, workspaceId)))
    .where(inArray(users.username, names));
  return rows.map((r) => r.id);
}

export type CommentView = {
  id: string;
  parentId: string | null;
  blockKey: string | null;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  suggestion: Suggestion | null;
  suggestionStatus: "pending" | "accepted" | "rejected" | null;
  resolvedAt: string | null;
};
export type Thread = CommentView & { replies: CommentView[] };

export async function listThreads(db: Executor, actor: Actor, sopId: string): Promise<Thread[]> {
  await loadSop(db, actor, sopId);
  if (!atLeast(actor, "viewer")) return [];
  const rows = await db
    .select({ c: comments, authorName: users.name })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.sopId, sopId), eq(comments.workspaceId, actor.workspaceId)))
    .orderBy(asc(comments.createdAt));
  const view = ({ c, authorName }: (typeof rows)[number]): CommentView => ({
    id: c.id,
    parentId: c.parentId,
    blockKey: c.blockKey,
    authorId: c.authorId,
    authorName,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    suggestion: c.suggestion ?? null,
    suggestionStatus: c.suggestionStatus ?? null,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
  });
  const roots = rows.filter((r) => !r.c.parentId).map((r) => ({ ...view(r), replies: [] as CommentView[] }));
  const byId = new Map(roots.map((r) => [r.id, r]));
  for (const r of rows) if (r.c.parentId) byId.get(r.c.parentId)?.replies.push(view(r));
  return roots;
}

export const CommentInput = z.object({
  body: z.string().trim().min(1, "Write a comment").max(5_000),
  blockKey: z.string().max(200).nullable().default(null),
  parentId: z.string().max(64).nullable().default(null),
  suggestion: z
    .object({ field: z.enum(["text", "title", "description", "expectedResult", "warning"]), after: z.string().max(10_000) })
    .nullable()
    .default(null),
});

export async function addComment(db: Executor, actor: Actor, sopId: string, input: z.input<typeof CommentInput>) {
  if (!atLeast(actor, "viewer") || !actor.userId) throw forbidden("Sign in to comment.");
  const data = CommentInput.parse(input);
  const { sop } = await loadSop(db, actor, sopId);
  let parent: typeof comments.$inferSelect | undefined;
  if (data.parentId) {
    [parent] = await db.select().from(comments).where(and(eq(comments.id, data.parentId), eq(comments.sopId, sopId))).limit(1);
    if (!parent) throw notFound("That thread no longer exists.");
    if (parent.parentId) throw invalid("Reply to the thread, not to a reply.");
  }
  const blockKey = parent ? parent.blockKey : data.blockKey;
  let suggestion: Suggestion | null = null;
  if (data.suggestion) {
    if (parent) throw invalid("Suggest an edit in a new thread.");
    if (!blockKey) throw invalid("Pick the step you're suggesting an edit to.");
    if (blockKey.includes("~")) throw invalid("This step comes from a shared snippet. Suggest the change on the snippet instead.");
    const node = findByKey(await workingTree(db, sop), blockKey);
    const before = node ? fieldText(node, data.suggestion.field) : null;
    if (before === null) throw invalid("That text can't be edited here.");
    if (before === data.suggestion.after) throw invalid("The suggestion is the same as the current text.");
    suggestion = { blockKey, field: data.suggestion.field, before, after: data.suggestion.after };
  }
  const mentions = await resolveMentions(db, actor.workspaceId, data.body);
  const [row] = await db
    .insert(comments)
    .values({ workspaceId: actor.workspaceId, sopId, blockKey, parentId: parent?.id ?? null, authorId: actor.userId, body: data.body, mentions, suggestion, suggestionStatus: suggestion ? "pending" : null })
    .returning();

  const link = `/sops/${sopId}?comments=${parent?.id ?? row.id}`;
  await notify(db, { workspaceId: actor.workspaceId, userIds: mentions, actorId: actor.userId, kind: "mention", title: `${actor.name} mentioned you on ${sop.title}`, body: data.body, link });
  // Thread participants (or the owner, for a new thread) hear about it unless they were just @mentioned.
  const participants = parent ? [parent.authorId, ...(await db.select({ a: comments.authorId }).from(comments).where(eq(comments.parentId, parent.id))).map((r) => r.a)] : [sop.ownerId];
  await notify(db, {
    workspaceId: actor.workspaceId,
    userIds: participants.filter((u) => !mentions.includes(u)),
    actorId: actor.userId,
    kind: suggestion ? "suggestion" : "comment",
    title: suggestion ? `${actor.name} suggested an edit to ${sop.title}` : parent ? `${actor.name} replied on ${sop.title}` : `${actor.name} commented on ${sop.title}`,
    body: data.body,
    link,
  });
  return { id: row.id };
}

async function loadComment(db: Executor, actor: Actor, id: string) {
  const [c] = await db.select().from(comments).where(and(eq(comments.id, id), eq(comments.workspaceId, actor.workspaceId))).limit(1);
  if (!c) throw notFound("Comment not found.");
  const loaded = await loadSop(db, actor, c.sopId);
  return { c, ...loaded };
}

/** Resolving closes a thread. The thread's author or any editor can do it. */
export async function setResolved(db: Executor, actor: Actor, threadId: string, resolved: boolean) {
  const { c, sop, visibility } = await loadComment(db, actor, threadId);
  if (c.parentId) throw invalid("Resolve the thread, not a reply.");
  if (c.authorId !== actor.userId && !canEditSop(actor, sop, visibility)) throw forbidden("Only the author or an editor can resolve this.");
  await db.update(comments).set(resolved ? { resolvedAt: new Date(), resolvedBy: actor.userId } : { resolvedAt: null, resolvedBy: null }).where(eq(comments.id, c.id));
}

export async function deleteComment(db: Executor, actor: Actor, id: string) {
  const { c } = await loadComment(db, actor, id);
  if (c.authorId !== actor.userId && !atLeast(actor, "admin")) throw forbidden("You can only delete your own comments.");
  await db.delete(comments).where(eq(comments.id, c.id));
}

/** Applies a suggested edit to the draft (creating one if needed) and closes the thread. */
export async function acceptSuggestion(db: Executor, actor: Actor, commentId: string) {
  const { c, sop, visibility } = await loadComment(db, actor, commentId);
  if (!canEditSop(actor, sop, visibility)) throw forbidden("Only editors can accept suggestions.");
  if (!c.suggestion || c.suggestionStatus !== "pending") throw invalid("This suggestion was already handled.");
  const s = c.suggestion;
  const { draft, blocks } = await getOrCreateDraft(db, actor, sop.id);
  const node = findByKey(blocks, s.blockKey);
  if (!node) throw conflict("That step was removed from the draft, so the suggestion can't be applied.");
  if (fieldText(node, s.field) !== s.before) throw conflict("The text changed after this suggestion was made. Apply it by hand in the editor.");
  const next = replaceByKey(blocks, s.blockKey, (n) => withField(n, s.field, s.after));
  await saveDraft(db, actor, sop.id, { title: draft.title, summary: draft.summary, blocks: next, baseUpdatedAt: draft.updatedAt.toISOString() });
  await db.update(comments).set({ suggestionStatus: "accepted", resolvedAt: new Date(), resolvedBy: actor.userId }).where(eq(comments.id, c.id));
  await audit(db, actor, "sop.suggestion_accepted", { type: "sop", id: sop.id }, { commentId: c.id, blockKey: s.blockKey, field: s.field });
  await notify(db, { workspaceId: actor.workspaceId, userIds: [c.authorId], actorId: actor.userId, kind: "suggestion_resolved", title: `${actor.name} accepted your suggestion on ${sop.title}`, body: "It's in the draft and goes live with the next published version.", link: `/sops/${sop.id}?comments=${c.id}` });
}

export async function rejectSuggestion(db: Executor, actor: Actor, commentId: string) {
  const { c, sop, visibility } = await loadComment(db, actor, commentId);
  if (!canEditSop(actor, sop, visibility)) throw forbidden("Only editors can reject suggestions.");
  if (!c.suggestion || c.suggestionStatus !== "pending") throw invalid("This suggestion was already handled.");
  await db.update(comments).set({ suggestionStatus: "rejected", resolvedAt: new Date(), resolvedBy: actor.userId }).where(eq(comments.id, c.id));
  await notify(db, { workspaceId: actor.workspaceId, userIds: [c.authorId], actorId: actor.userId, kind: "suggestion_resolved", title: `${actor.name} didn't use your suggestion on ${sop.title}`, body: "", link: `/sops/${sop.id}?comments=${c.id}` });
}

/** Open (unresolved) thread counts per block key, for the step badges. */
export function openCounts(threads: Thread[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of threads) if (!t.resolvedAt) out[t.blockKey ?? ""] = (out[t.blockKey ?? ""] ?? 0) + 1;
  return out;
}
