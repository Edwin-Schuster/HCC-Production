import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { folders, notifications, sops, sopVersions } from "@/db/schema";
import { step } from "@/blocks/build";
import { createSop, getEditorState, publishDraft, saveDraft } from "@/server/services/sops";
import { decide, getApprovalState, requestReview } from "@/server/services/approvals";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

async function setup(required: number, prefix: string) {
  const author = await t.actorFor("editor", `${prefix}-author`);
  const r1 = await t.actorFor("editor", `${prefix}-r1`);
  const r2 = await t.actorFor("editor", `${prefix}-r2`);
  const folder = await t.folder(`Approvals ${prefix}`, prefix.toUpperCase());
  await t.db.update(folders).set({ requiredApprovals: required }).where(eq(folders.id, folder.id));
  const sop = await createSop(t.db, author, { title: "Needs approval", folderId: folder.id });
  await saveDraft(t.db, author, sop.id, { title: "Needs approval", blocks: [step("a")] });
  const draftAt = async () => (await getApprovalState(t.db, author, sop.id)).draftUpdatedAt!;
  return { author, r1, r2, folder, sop, draftAt };
}

describe("approval workflow", () => {
  it("blocks publishing until enough approvers sign off, and records who approved", async () => {
    const { author, r1, r2, sop, draftAt } = await setup(2, "apa");
    await expect(publishDraft(t.db, author, sop.id, { changeSummary: "First version" })).rejects.toThrow(/needs 2 approvals/);

    await requestReview(t.db, author, sop.id, { approverIds: [r1.userId!, r2.userId!] });
    expect((await t.db.select().from(sops).where(eq(sops.id, sop.id)))[0].status).toBe("in_review");
    expect(await t.db.select().from(notifications).where(eq(notifications.userId, r1.userId!))).toHaveLength(1);

    await decide(t.db, r1, sop.id, { decision: "approved", draftUpdatedAt: await draftAt() });
    await expect(publishDraft(t.db, author, sop.id, { changeSummary: "First version" })).rejects.toThrow(/It has 1/);
    await decide(t.db, r2, sop.id, { decision: "approved", draftUpdatedAt: await draftAt() });
    expect((await t.db.select().from(sops).where(eq(sops.id, sop.id)))[0].status).toBe("approved");

    const { versionId } = await publishDraft(t.db, author, sop.id, { changeSummary: "First version" });
    const [v] = await t.db.select().from(sopVersions).where(eq(sopVersions.id, versionId));
    expect(v.approvedBy.map((a) => a.userId).sort()).toEqual([r1.userId, r2.userId].sort());
  });

  it("drops approvals when the draft changes after them", async () => {
    const { author, r1, sop, draftAt } = await setup(1, "apb");
    await decide(t.db, r1, sop.id, { decision: "approved", draftUpdatedAt: await draftAt() });
    expect((await getApprovalState(t.db, author, sop.id)).validApprovals).toBe(1);
    const { draftUpdatedAt } = await getEditorState(t.db, author, sop.id);
    await saveDraft(t.db, author, sop.id, { title: "Needs approval", blocks: [step("a"), step("b sneaked in")], baseUpdatedAt: draftUpdatedAt });
    expect((await getApprovalState(t.db, author, sop.id)).validApprovals).toBe(0);
    expect((await t.db.select().from(sops).where(eq(sops.id, sop.id)))[0].status).toBe("in_review");
    await expect(publishDraft(t.db, author, sop.id, { changeSummary: "First version" })).rejects.toThrow(/needs 1 approval/);
  });

  it("won't let the latest editor approve their own changes, or approve a draft they haven't seen", async () => {
    const { author, r1, sop, draftAt } = await setup(1, "apc");
    await expect(decide(t.db, author, sop.id, { decision: "approved", draftUpdatedAt: await draftAt() })).rejects.toThrow(/someone else has to approve/);
    await expect(decide(t.db, r1, sop.id, { decision: "approved", draftUpdatedAt: new Date(0).toISOString() })).rejects.toThrow(/changed while you were reviewing/);
    const viewer = await t.actorFor("viewer", "apc-viewer");
    await expect(decide(t.db, viewer, sop.id, { decision: "approved", draftUpdatedAt: await draftAt() })).rejects.toThrow();
  });

  it("uses the strictest setting of the folder and its parents", async () => {
    const parent = await t.folder("Strict parent", "STP");
    await t.db.update(folders).set({ requiredApprovals: 2 }).where(eq(folders.id, parent.id));
    const [child] = await t.db.insert(folders).values({ workspaceId: t.ws.id, name: "Child", codePrefix: "STC", parentId: parent.id }).returning();
    const author = await t.actorFor("editor", "apd-author");
    const sop = await createSop(t.db, author, { title: "In child", folderId: child.id });
    expect((await getApprovalState(t.db, author, sop.id)).required).toBe(2);
  });

  it("changes requested needs a comment and leaves the draft unapproved", async () => {
    const { author, r1, sop, draftAt } = await setup(1, "ape");
    await expect(decide(t.db, r1, sop.id, { decision: "changes_requested", draftUpdatedAt: await draftAt() })).rejects.toThrow(/Say what needs to change/);
    await decide(t.db, r1, sop.id, { decision: "changes_requested", comment: "Step 1 is missing the breaker number", draftUpdatedAt: await draftAt() });
    const state = await getApprovalState(t.db, author, sop.id);
    expect(state.validApprovals).toBe(0);
    expect(state.decisions[0]).toMatchObject({ decision: "changes_requested", current: true });
  });
});
