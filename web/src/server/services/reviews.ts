import { and, asc, eq, isNotNull, lte, ne } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { folders, sops, users } from "@/db/schema";
import { reviewState, type ReviewState } from "@/lib/review";
import { forbidden, invalid, notFound } from "@/server/errors";
import { canEditSop, canReadDrafts, type Actor } from "@/server/permissions";
import { audit } from "./audit";
import { notify } from "./notifications";

export type ReviewItem = { id: string; documentCode: string; title: string; ownerId: string; ownerName: string; folderName: string; nextReviewAt: string; state: ReviewState };

/** Published SOPs ordered by when they're due for review. */
export async function listReviews(db: Executor, actor: Actor, now = new Date()): Promise<ReviewItem[]> {
  if (!canReadDrafts(actor)) throw forbidden("Only editors can see the review schedule.");
  const rows = await db
    .select({ sop: sops, ownerName: users.name, folderName: folders.name })
    .from(sops)
    .innerJoin(users, eq(users.id, sops.ownerId))
    .innerJoin(folders, eq(folders.id, sops.folderId))
    .where(and(eq(sops.workspaceId, actor.workspaceId), isNotNull(sops.currentVersionId), ne(sops.status, "retired"), isNotNull(sops.nextReviewAt)))
    .orderBy(asc(sops.nextReviewAt));
  return rows.map((r) => ({
    id: r.sop.id,
    documentCode: r.sop.documentCode,
    title: r.sop.title,
    ownerId: r.sop.ownerId,
    ownerName: r.ownerName,
    folderName: r.folderName,
    nextReviewAt: r.sop.nextReviewAt!.toISOString(),
    state: reviewState(r.sop.nextReviewAt, now),
  }));
}

export const MarkReviewedInput = z.object({ note: z.string().trim().max(1_000).default("") });

/** "Still accurate, no changes needed": restarts the review clock without a new version. */
export async function markReviewed(db: Executor, actor: Actor, sopId: string, input: z.input<typeof MarkReviewedInput>) {
  const { note } = MarkReviewedInput.parse(input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ sop: sops, visibility: folders.visibility })
      .from(sops)
      .innerJoin(folders, eq(folders.id, sops.folderId))
      .where(and(eq(sops.id, sopId), eq(sops.workspaceId, actor.workspaceId)))
      .for("update", { of: sops })
      .limit(1);
    if (!row) throw notFound("SOP not found.");
    if (!canEditSop(actor, row.sop, row.visibility)) throw forbidden("You can't review this SOP.");
    if (!row.sop.currentVersionId) throw invalid("Publish the SOP before marking it reviewed.");
    const now = new Date();
    const next = new Date(now.getTime() + row.sop.reviewIntervalDays * 864e5);
    await tx.update(sops).set({ nextReviewAt: next, updatedAt: now }).where(eq(sops.id, sopId));
    await audit(tx, actor, "sop.reviewed", { type: "sop", id: sopId }, { note, previousDue: row.sop.nextReviewAt?.toISOString() ?? null, nextReviewAt: next.toISOString() });
    return { nextReviewAt: next.toISOString() };
  });
}

/**
 * Reminds owners about reviews due within a week, then weekly once overdue.
 * Safe to run as often as you like: each reminder has a dedupe key.
 */
export async function sweepReviewReminders(db: Executor, now = new Date()) {
  const horizon = new Date(now.getTime() + 7 * 864e5);
  const rows = await db
    .select({ id: sops.id, workspaceId: sops.workspaceId, title: sops.title, ownerId: sops.ownerId, nextReviewAt: sops.nextReviewAt })
    .from(sops)
    .where(and(isNotNull(sops.currentVersionId), ne(sops.status, "retired"), lte(sops.nextReviewAt, horizon)));
  let sent = 0;
  for (const r of rows) {
    const due = r.nextReviewAt!;
    const day = due.toISOString().slice(0, 10);
    const overdue = due < now;
    const week = Math.floor((now.getTime() - due.getTime()) / (7 * 864e5));
    sent += await notify(db, {
      workspaceId: r.workspaceId,
      userIds: [r.ownerId],
      actorId: null,
      kind: overdue ? "review_overdue" : "review_due",
      title: overdue ? `Review overdue: ${r.title}` : `Review due soon: ${r.title}`,
      body: overdue ? `It was due on ${day}. Check it's still accurate, then mark it reviewed or publish an update.` : `Due on ${day}.`,
      link: `/sops/${r.id}`,
      dedupeKey: overdue ? `review_overdue:${r.id}:${day}:${week}` : `review_due:${r.id}:${day}`,
    });
  }
  return sent;
}
