import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { feedback, sops, users } from "@/db/schema";
import { numberSteps, plain, walk } from "@/blocks/tree";
import type { BlockNode } from "@/blocks/schema";
import { forbidden, invalid, notFound } from "@/server/errors";
import { atLeast, canEditSop, canReadDrafts, type Actor } from "@/server/permissions";
import { notify } from "./notifications";
import { emit } from "./webhooks";
import { getSopDocument, loadSop } from "./sops";

/** "Step 3.2: Load the show file", used to label feedback and comments. */
export function blockLabel(tree: BlockNode[], key: string): string | null {
  const numbers = numberSteps(tree);
  for (const { node } of walk(tree)) {
    if (node.key !== key) continue;
    if (node.type === "step") return `Step ${numbers.get(node.id)}: ${plain(node.content.title)}`.slice(0, 200);
    return node.type.charAt(0).toUpperCase() + node.type.slice(1).replace("_", " ");
  }
  return null;
}

export const FeedbackInput = z.object({
  blockKey: z.string().min(1).max(200),
  type: z.enum(["unclear", "wrong", "other"]),
  message: z.string().trim().max(2_000).default(""),
});

/** A reader flags a step on the published version; the owner hears about it. */
export async function submitFeedback(db: Executor, actor: Actor, sopId: string, input: z.input<typeof FeedbackInput>) {
  if (!atLeast(actor, "viewer") || !actor.userId) throw forbidden("Sign in to send feedback.");
  const data = FeedbackInput.parse(input);
  if (data.type === "other" && !data.message) throw invalid("Tell the owner what's wrong.");
  const doc = await getSopDocument(db, actor, sopId);
  if (doc.version.isDraft || !doc.sop.currentVersionId) throw invalid("Feedback is for published SOPs.");
  const label = blockLabel(doc.blocks, data.blockKey);
  if (!label) throw invalid("That step isn't in the current version.");
  const [row] = await db
    .insert(feedback)
    .values({ workspaceId: actor.workspaceId, sopId, versionId: doc.version.id, blockKey: data.blockKey, blockLabel: label, userId: actor.userId, type: data.type, message: data.message })
    .returning();
  await emit(db, actor.workspaceId, "feedback.created", { id: row.id, sopId, documentCode: doc.sop.documentCode, step: label, type: data.type, message: data.message });
  const what = data.type === "unclear" ? "is unclear" : data.type === "wrong" ? "is wrong" : "needs attention";
  await notify(db, {
    workspaceId: actor.workspaceId,
    userIds: [doc.sop.ownerId],
    actorId: actor.userId,
    kind: "feedback",
    title: `${actor.name}: ${label.split(":")[0]} of ${doc.sop.title} ${what}`,
    body: data.message,
    link: `/sops/${sopId}/feedback`,
  });
  return { id: row.id };
}

export type FeedbackItem = {
  id: string;
  sopId: string;
  blockKey: string;
  blockLabel: string;
  type: "unclear" | "wrong" | "other";
  message: string;
  status: "open" | "accepted" | "rejected";
  userName: string;
  versionNumber: number | null;
  createdAt: string;
  resolvedByName: string | null;
  resolutionNote: string;
};

/** Editors see all feedback on an SOP; anyone else only their own. */
export async function listFeedback(db: Executor, actor: Actor, sopId: string, opts: { status?: "open" | "accepted" | "rejected" } = {}): Promise<FeedbackItem[]> {
  await loadSop(db, actor, sopId);
  if (!actor.userId) return [];
  const resolver = sql<string | null>`(select name from ${users} r where r.id = ${feedback.resolvedBy})`;
  const version = sql<number | null>`(select version_number from sop_versions v where v.id = ${feedback.versionId})`;
  const rows = await db
    .select({ f: feedback, userName: users.name, resolvedByName: resolver, versionNumber: version })
    .from(feedback)
    .innerJoin(users, eq(users.id, feedback.userId))
    .where(and(eq(feedback.sopId, sopId), opts.status ? eq(feedback.status, opts.status) : undefined, canReadDrafts(actor) ? undefined : eq(feedback.userId, actor.userId)))
    .orderBy(desc(feedback.createdAt));
  return rows.map(({ f, userName, resolvedByName, versionNumber }) => ({
    id: f.id,
    sopId: f.sopId,
    blockKey: f.blockKey,
    blockLabel: f.blockLabel,
    type: f.type,
    message: f.message,
    status: f.status,
    userName,
    versionNumber,
    createdAt: f.createdAt.toISOString(),
    resolvedByName,
    resolutionNote: f.resolutionNote,
  }));
}

/** Open feedback counts per SOP, for badges. Editors only. */
export async function openFeedbackCounts(db: Executor, actor: Actor, sopIds: string[]): Promise<Map<string, number>> {
  if (!canReadDrafts(actor) || !sopIds.length) return new Map();
  const rows = await db
    .select({ sopId: feedback.sopId, n: sql<number>`count(*)::int` })
    .from(feedback)
    .where(and(eq(feedback.workspaceId, actor.workspaceId), eq(feedback.status, "open"), inArray(feedback.sopId, sopIds)))
    .groupBy(feedback.sopId);
  return new Map(rows.map((r) => [r.sopId, r.n]));
}

export const ResolveFeedbackInput = z.object({ status: z.enum(["accepted", "rejected", "open"]), note: z.string().trim().max(2_000).default("") });

/** Accept ("we'll fix it") or reject ("it's correct as written"), telling the person who raised it. */
export async function resolveFeedback(db: Executor, actor: Actor, feedbackId: string, input: z.input<typeof ResolveFeedbackInput>) {
  const data = ResolveFeedbackInput.parse(input);
  const [f] = await db.select().from(feedback).where(and(eq(feedback.id, feedbackId), eq(feedback.workspaceId, actor.workspaceId))).limit(1);
  if (!f) throw notFound("Feedback not found.");
  const { sop, visibility } = await loadSop(db, actor, f.sopId);
  if (!canEditSop(actor, sop, visibility)) throw forbidden("Only editors can resolve feedback.");
  const open = data.status === "open";
  await db
    .update(feedback)
    .set({ status: data.status, resolutionNote: data.note, resolvedBy: open ? null : actor.userId, resolvedAt: open ? null : new Date() })
    .where(eq(feedback.id, f.id));
  if (!open) {
    const [s] = await db.select({ title: sops.title }).from(sops).where(eq(sops.id, f.sopId));
    await notify(db, {
      workspaceId: actor.workspaceId,
      userIds: [f.userId],
      actorId: actor.userId,
      kind: "feedback_resolved",
      title: data.status === "accepted" ? `${actor.name} accepted your feedback on ${s.title}` : `${actor.name} reviewed your feedback on ${s.title}`,
      body: data.note || f.blockLabel,
      link: `/sops/${f.sopId}#k-${f.blockKey}`,
    });
  }
}
