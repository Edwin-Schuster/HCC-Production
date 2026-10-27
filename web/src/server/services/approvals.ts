import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { sopApprovals, sops, sopVersions, users } from "@/db/schema";
import { forbidden, invalid } from "@/server/errors";
import { atLeast, canEditSop, type Actor } from "@/server/permissions";
import { audit } from "./audit";
import { effectiveRequiredApprovals } from "./folders";
import { membersWithRole, notify } from "./notifications";
import { draftOf, loadSop } from "./sops";

/**
 * Approvals: a folder can require N approvals before a draft is published. An approval counts only while
 * the draft is unchanged since it was given, and never from the person who made the latest changes.
 */

type DraftRow = typeof sopVersions.$inferSelect;
type ApprovalRow = typeof sopApprovals.$inferSelect;

export type ApprovalView = { userId: string; name: string; decision: "approved" | "changes_requested"; comment: string; createdAt: string; current: boolean };
export type ApprovalState = {
  required: number;
  draftUpdatedAt: string | null;
  lastEditorId: string | null;
  reviewRequestedAt: string | null;
  /** Latest decision per person. */
  decisions: ApprovalView[];
  validApprovals: number;
  canApprove: boolean;
  canPublish: boolean;
};

/** Latest decision from each person, and which approvals still count for this draft. */
export function countApprovals(draft: Pick<DraftRow, "updatedAt" | "updatedBy">, rows: ApprovalRow[]) {
  const latest = new Map<string, ApprovalRow>();
  for (const r of [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) latest.set(r.userId, r);
  const valid = [...latest.values()].filter((r) => r.decision === "approved" && r.draftUpdatedAt.getTime() === draft.updatedAt.getTime() && r.userId !== draft.updatedBy);
  return { latest: [...latest.values()], valid };
}

export async function getApprovalState(db: Executor, actor: Actor, sopId: string): Promise<ApprovalState> {
  const { sop, visibility } = await loadSop(db, actor, sopId);
  const required = await effectiveRequiredApprovals(db, sop.folderId);
  const draft = await draftOf(db, sop.id);
  const canEdit = canEditSop(actor, sop, visibility);
  if (!draft) return { required, draftUpdatedAt: null, lastEditorId: null, reviewRequestedAt: null, decisions: [], validApprovals: 0, canApprove: false, canPublish: false };
  const rows = await db.select().from(sopApprovals).where(eq(sopApprovals.versionId, draft.id)).orderBy(asc(sopApprovals.createdAt));
  const names = new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]));
  const { latest, valid } = countApprovals(draft, rows);
  const validIds = new Set(valid.map((v) => v.id));
  const sameDraft = (r: ApprovalRow) => r.draftUpdatedAt.getTime() === draft.updatedAt.getTime();
  return {
    required,
    draftUpdatedAt: draft.updatedAt.toISOString(),
    lastEditorId: draft.updatedBy,
    reviewRequestedAt: draft.reviewRequestedAt?.toISOString() ?? null,
    decisions: latest.map((r) => ({
      userId: r.userId,
      name: names.get(r.userId) ?? "Unknown",
      decision: r.decision,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      current: validIds.has(r.id) || (r.decision === "changes_requested" && sameDraft(r)),
    })),
    validApprovals: valid.length,
    canApprove: canEdit && actor.userId !== draft.updatedBy,
    canPublish: canEdit && valid.length >= required,
  };
}

export const RequestReviewInput = z.object({
  approverIds: z.array(z.string().max(64)).max(20).default([]),
  message: z.string().trim().max(1_000).default(""),
});

export async function requestReview(db: Executor, actor: Actor, sopId: string, input: z.input<typeof RequestReviewInput>) {
  const data = RequestReviewInput.parse(input);
  return db.transaction(async (tx) => {
    const { sop, visibility } = await loadSop(tx, actor, sopId, { forUpdate: true });
    if (!canEditSop(actor, sop, visibility)) throw forbidden("You can't edit this SOP.");
    const draft = await draftOf(tx, sop.id);
    if (!draft) throw invalid("There is no draft to review.");
    const now = new Date();
    await tx.update(sopVersions).set({ reviewRequestedAt: now, reviewRequestedBy: actor.userId }).where(eq(sopVersions.id, draft.id));
    if (!sop.currentVersionId) await tx.update(sops).set({ status: "in_review", updatedAt: now }).where(eq(sops.id, sop.id));
    const editors = await membersWithRole(tx, actor.workspaceId, ["editor", "admin"]);
    const chosen = data.approverIds.filter((id) => editors.includes(id));
    await notify(tx, {
      workspaceId: actor.workspaceId,
      userIds: chosen.length ? chosen : editors,
      actorId: actor.userId,
      kind: "review_requested",
      title: `${actor.name} asked for a review: ${draft.title}`,
      body: data.message,
      link: `/sops/${sop.id}?draft=1#review`,
    });
    await audit(tx, actor, "sop.review_requested", { type: "sop", id: sop.id }, { versionId: draft.id, approverIds: chosen, message: data.message });
  });
}

export const DecisionInput = z.object({
  decision: z.enum(["approved", "changes_requested"]),
  comment: z.string().trim().max(2_000).default(""),
  /** The draft the reviewer looked at. A newer draft means they'd be approving something they haven't seen. */
  draftUpdatedAt: z.string().datetime(),
});

export async function decide(db: Executor, actor: Actor, sopId: string, input: z.input<typeof DecisionInput>) {
  const data = DecisionInput.parse(input);
  if (data.decision === "changes_requested" && !data.comment) throw invalid("Say what needs to change.");
  return db.transaction(async (tx) => {
    const { sop, visibility } = await loadSop(tx, actor, sopId, { forUpdate: true });
    if (!atLeast(actor, "editor") || !canEditSop(actor, sop, visibility)) throw forbidden("Only editors can approve SOPs.");
    const draft = await draftOf(tx, sop.id);
    if (!draft) throw invalid("There is no draft to review.");
    if (draft.updatedBy === actor.userId) throw forbidden("You made the latest changes, so someone else has to approve them.");
    if (draft.updatedAt.getTime() !== new Date(data.draftUpdatedAt).getTime()) throw invalid("The draft changed while you were reviewing it. Reload to see the latest version.");
    await tx.insert(sopApprovals).values({ sopId: sop.id, versionId: draft.id, userId: actor.userId!, decision: data.decision, comment: data.comment, draftUpdatedAt: draft.updatedAt });

    const rows = await tx.select().from(sopApprovals).where(eq(sopApprovals.versionId, draft.id));
    const required = await effectiveRequiredApprovals(tx, sop.folderId);
    const { valid } = countApprovals(draft, rows);
    const ready = valid.length >= required;
    if (!sop.currentVersionId) await tx.update(sops).set({ status: ready ? "approved" : "in_review", updatedAt: new Date() }).where(eq(sops.id, sop.id));
    await notify(tx, {
      workspaceId: actor.workspaceId,
      userIds: [draft.reviewRequestedBy, draft.updatedBy, sop.ownerId],
      actorId: actor.userId,
      kind: data.decision === "approved" ? "approved" : "changes_requested",
      title: data.decision === "approved" ? `${actor.name} approved ${draft.title}${ready ? ". Ready to publish." : ""}` : `${actor.name} asked for changes to ${draft.title}`,
      body: data.comment,
      link: data.decision === "approved" ? `/sops/${sop.id}/edit` : `/sops/${sop.id}?draft=1#review`,
    });
    await audit(tx, actor, data.decision === "approved" ? "sop.approved" : "sop.changes_requested", { type: "sop", id: sop.id }, { versionId: draft.id, comment: data.comment });
    return { validApprovals: valid.length, required };
  });
}

/** Called inside publishDraft's transaction: refuses publishing without enough approvals and returns who approved. */
export async function approvalsForPublish(tx: Executor, folderId: string, draft: DraftRow) {
  const required = await effectiveRequiredApprovals(tx, folderId);
  const rows = await tx.select().from(sopApprovals).where(and(eq(sopApprovals.versionId, draft.id)));
  const { valid } = countApprovals(draft, rows);
  if (valid.length < required) throw forbidden(`This folder needs ${required} approval${required === 1 ? "" : "s"} before publishing. ${valid.length ? `It has ${valid.length}.` : "Request a review first."}`);
  return valid.map((v) => ({ userId: v.userId, approvedAt: v.createdAt.toISOString() }));
}
