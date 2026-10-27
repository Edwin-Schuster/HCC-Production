import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditEvents } from "@/db/schema";
import { step } from "@/blocks/build";
import { plain } from "@/blocks/tree";
import { diffVersions } from "@/blocks/diff";
import { createSop, getEditorState, getSopDocument, publishDraft, restoreVersion, saveDraft } from "@/server/services/sops";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("restore (rollback)", () => {
  it("copies an old version into a new draft with the same keys, and publishing it moves history forward", async () => {
    const admin = await t.actorFor("admin");
    const sop = await createSop(t.db, admin, { title: "Rollback", folderId: t.general.id });
    await saveDraft(t.db, admin, sop.id, { title: "Rollback", blocks: [step("Original wording")] });
    await publishDraft(t.db, admin, sop.id, { changeSummary: "First version" });
    const e = await getEditorState(t.db, admin, sop.id);
    const changed = e.blocks.map((b) => (b.type === "step" ? { ...b, content: { ...b.content, title: [{ text: "Bad change" }] } } : b));
    await saveDraft(t.db, admin, sop.id, { title: "Rollback", blocks: changed, baseVersionId: e.baseVersionId });
    await publishDraft(t.db, admin, sop.id, { changeSummary: "Oops" });

    await restoreVersion(t.db, admin, sop.id, 1);
    const draft = await getSopDocument(t.db, admin, sop.id, "draft");
    expect(draft.blocks[0].type === "step" && plain(draft.blocks[0].content.title)).toBe("Original wording");
    const v1 = await getSopDocument(t.db, admin, sop.id, 1);
    expect(draft.blocks[0].key).toBe(v1.blocks[0].key);
    expect(diffVersions(v1.blocks, draft.blocks).every((d) => d.status === "same")).toBe(true);

    await expect(restoreVersion(t.db, admin, sop.id, 1)).rejects.toThrow(/already a draft/);
    await restoreVersion(t.db, admin, sop.id, 2, { replaceDraft: true });
    const { versionNumber } = await publishDraft(t.db, admin, sop.id, { changeSummary: "Restored" });
    expect(versionNumber).toBe(3);
    expect(await t.db.select().from(auditEvents).where(and(eq(auditEvents.targetId, sop.id), eq(auditEvents.action, "sop.rolled_back")))).toHaveLength(2);
  });

  it("is editor-only", async () => {
    const admin = await t.actorFor("admin");
    const viewer = await t.actorFor("viewer", "restore-viewer");
    const sop = await createSop(t.db, admin, { title: "No restore", folderId: t.general.id });
    await saveDraft(t.db, admin, sop.id, { title: "No restore", blocks: [step("a")] });
    await publishDraft(t.db, admin, sop.id, { changeSummary: "First version" });
    await expect(restoreVersion(t.db, viewer, sop.id, 1)).rejects.toThrow(/can't edit/);
  });
});
