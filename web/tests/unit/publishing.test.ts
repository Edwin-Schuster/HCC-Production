import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { blocks, sopVersions, auditEvents } from "@/db/schema";
import { isImmutableVersionError } from "@/db";
import { callout, step } from "@/blocks/build";
import { createSop, getEditorState, getOrCreateDraft, getSopDocument, listVersions, publishDraft, saveDraft, discardDraft, deleteSop, updateSopMeta } from "@/server/services/sops";
import { startRun } from "@/server/services/runs";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { t = await testDb(); });
afterAll(async () => { await t.close(); });

async function newSop(title = "Test SOP") {
  const admin = await t.actorFor("admin");
  const sop = await createSop(t.db, admin, { title, folderId: t.general.id });
  return { admin, sop };
}

describe("document codes", () => {
  it("are generated per folder prefix and never reused", async () => {
    const admin = await t.actorFor("admin");
    const aud = await t.folder("Audio", "AUD");
    const a = await createSop(t.db, admin, { title: "A", folderId: aud.id });
    const b = await createSop(t.db, admin, { title: "B", folderId: aud.id });
    await deleteSop(t.db, admin, b.id);
    const c = await createSop(t.db, admin, { title: "C", folderId: aud.id });
    expect([a.documentCode, b.documentCode, c.documentCode]).toEqual(["SOP-AUD-001", "SOP-AUD-002", "SOP-AUD-003"]);
  });

  it("can be edited by the owner or an admin, must stay unique, and can follow a move", async () => {
    const admin = await t.actorFor("admin");
    const editor = await t.actorFor("editor", "code-ed");
    const svc = await t.folder("Service", "SVC");
    const vid = await t.folder("Video", "VID");
    const one = await createSop(t.db, admin, { title: "One", folderId: svc.id });
    const two = await createSop(t.db, admin, { title: "Two", folderId: svc.id });
    const code = async (id: string) => (await getSopDocument(t.db, admin, id)).sop.documentCode;

    await updateSopMeta(t.db, admin, two.id, { documentCode: " sop-svc-010 " });
    expect(await code(two.id)).toBe("SOP-SVC-010");
    await expect(updateSopMeta(t.db, admin, one.id, { documentCode: "SOP-SVC-010" })).rejects.toThrow(/already used by “Two”/);
    await expect(updateSopMeta(t.db, admin, one.id, { documentCode: "bad code!" })).rejects.toThrow();
    await expect(updateSopMeta(t.db, editor, one.id, { documentCode: "SOP-SVC-099" })).rejects.toThrow(/owner or an admin/);

    // Moving to Video with a new code takes the next free Video number.
    await updateSopMeta(t.db, admin, one.id, { folderId: vid.id, newCodeForFolder: true });
    expect(await code(one.id)).toBe("SOP-VID-001");
    // A hand-picked code is skipped when the next code is handed out.
    await updateSopMeta(t.db, admin, two.id, { documentCode: "SOP-VID-002" });
    const three = await createSop(t.db, admin, { title: "Three", folderId: vid.id });
    expect(three.documentCode).toBe("SOP-VID-003");
  });
});

describe("editing without a draft", () => {
  it("opens on the published version and creates the draft on first save, refusing outdated bases", async () => {
    const { admin, sop } = await newSop("Lazy draft");
    await saveDraft(t.db, admin, sop.id, { title: "Lazy draft", blocks: [step("one")] });
    const v1 = await publishDraft(t.db, admin, sop.id, { changeSummary: "First version" });

    const a = await getEditorState(t.db, admin, sop.id);
    expect(a.draftExists).toBe(false);
    expect(a.baseVersionId).toBe(v1.versionId);
    const b = await getEditorState(t.db, admin, sop.id); // a second editor opens the same version
    expect(await getEditorState(t.db, admin, sop.id).then((s) => s.draftExists)).toBe(false); // opening never creates drafts

    await saveDraft(t.db, admin, sop.id, { title: "Lazy draft", blocks: a.blocks, baseVersionId: a.baseVersionId });
    await publishDraft(t.db, admin, sop.id, { changeSummary: "Second version" });
    // b started from v1, which is no longer current.
    await expect(saveDraft(t.db, admin, sop.id, { title: "x", blocks: b.blocks, baseVersionId: b.baseVersionId })).rejects.toMatchObject({ status: 409, details: { reason: "outdated" } });
  });
});

describe("publishing", () => {
  it("requires a change summary and content", async () => {
    const { admin, sop } = await newSop();
    await expect(publishDraft(t.db, admin, sop.id, { changeSummary: "" })).rejects.toThrow(/change/i);
    await expect(publishDraft(t.db, admin, sop.id, { changeSummary: "First" })).rejects.toThrow(/content/i);
  });

  it("creates numbered immutable versions and a fresh draft from the latest", async () => {
    const { admin, sop } = await newSop("Startup");
    const { draft } = await getOrCreateDraft(t.db, admin, sop.id);
    await saveDraft(t.db, admin, sop.id, { title: "Startup", blocks: [step("Turn on UPS")], baseUpdatedAt: draft.updatedAt.toISOString() });
    const v1 = await publishDraft(t.db, admin, sop.id, { changeSummary: "First version" });
    expect(v1.versionNumber).toBe(1);

    // No draft remains; editing starts a new one copied from v1 with new ids but the same keys.
    const second = await getOrCreateDraft(t.db, admin, sop.id);
    expect(second.created).toBe(true);
    const v1doc = await getSopDocument(t.db, admin, sop.id, 1);
    expect(second.blocks[0].key).toBe(v1doc.blocks[0].key);
    expect(second.blocks[0].id).not.toBe(v1doc.blocks[0].id);

    await saveDraft(t.db, admin, sop.id, { title: "Startup", blocks: [...second.blocks, step("Turn on amps")] });
    const v2 = await publishDraft(t.db, admin, sop.id, { changeSummary: "Added amps" });
    expect(v2.versionNumber).toBe(2);

    const versions = await listVersions(t.db, admin, sop.id);
    expect(versions.map((v) => [v.number, v.changeSummary, v.isCurrent])).toEqual([[2, "Added amps", true], [1, "First version", false]]);
    // v1 still reads exactly as published.
    expect((await getSopDocument(t.db, admin, sop.id, 1)).blocks).toHaveLength(1);
    expect((await getSopDocument(t.db, admin, sop.id)).blocks).toHaveLength(2);

    const events = await t.db.select().from(auditEvents).where(eq(auditEvents.targetId, sop.id));
    expect(events.filter((e) => e.action === "sop.published")).toHaveLength(2);
  });

  it("blocks any change to a published version at the database level", async () => {
    const { admin, sop } = await newSop("Frozen");
    await saveDraft(t.db, admin, sop.id, { title: "Frozen", blocks: [callout("info", "hello")] });
    const { versionId } = await publishDraft(t.db, admin, sop.id, { changeSummary: "First version" });
    const attempts = [
      () => t.db.update(sopVersions).set({ title: "hacked" }).where(eq(sopVersions.id, versionId)),
      () => t.db.delete(sopVersions).where(eq(sopVersions.id, versionId)),
      () => t.db.update(blocks).set({ searchText: "x" }).where(eq(blocks.versionId, versionId)),
      () => t.db.delete(blocks).where(eq(blocks.versionId, versionId)),
      () => t.db.insert(blocks).values({ versionId, key: "k", position: 9, type: "divider", content: {} }),
    ];
    for (const attempt of attempts) {
      const err = await attempt().then(() => null, (e) => e);
      expect(err, "expected the trigger to reject the change").not.toBeNull();
      expect(isImmutableVersionError(err)).toBe(true);
    }
    // Deleting a published SOP is for admins only.
    const editor = await t.actorFor("editor", "pub-del-ed");
    await expect(deleteSop(t.db, editor, sop.id)).rejects.toThrow(/Only/);
  });

  it("detects stale autosaves and can discard a draft", async () => {
    const { admin, sop } = await newSop("Stale");
    const { draft } = await getOrCreateDraft(t.db, admin, sop.id);
    const base = draft.updatedAt.toISOString();
    await saveDraft(t.db, admin, sop.id, { title: "Stale", blocks: [step("one")], baseUpdatedAt: base });
    await expect(saveDraft(t.db, admin, sop.id, { title: "Stale", blocks: [step("two")], baseUpdatedAt: base })).rejects.toMatchObject({ status: 409 });
    await saveDraft(t.db, admin, sop.id, { title: "Stale", blocks: [step("two")], baseUpdatedAt: base, force: true });
    await publishDraft(t.db, admin, sop.id, { changeSummary: "First version" });
    await getOrCreateDraft(t.db, admin, sop.id);
    await discardDraft(t.db, admin, sop.id);
    await expect(getSopDocument(t.db, admin, sop.id, "draft")).rejects.toMatchObject({ status: 404 });
  });

  it("audits metadata changes on published SOPs", async () => {
    const { admin, sop } = await newSop("Meta");
    await saveDraft(t.db, admin, sop.id, { title: "Meta", blocks: [step("x")] });
    await publishDraft(t.db, admin, sop.id, { changeSummary: "First version" });
    await updateSopMeta(t.db, admin, sop.id, { tags: ["Audio", "audio", "sunday"], reviewIntervalDays: 30 });
    const doc = await getSopDocument(t.db, admin, sop.id);
    expect(doc.sop.tags).toEqual(["audio", "sunday"]);
    const [ev] = (await t.db.select().from(auditEvents).where(eq(auditEvents.targetId, sop.id))).filter((e) => e.action === "sop.metadata_updated");
    expect(ev.metadata).toMatchObject({ published: true, changes: { reviewIntervalDays: 30 } });
  });
});

describe("deleting a published SOP", () => {
  it("lets an admin remove it with its history, and leaves other SOPs immutable", async () => {
    const publish = async (title: string) => {
      const { admin, sop } = await newSop(title);
      const draft = await getOrCreateDraft(t.db, admin, sop.id);
      await saveDraft(t.db, admin, sop.id, { title, blocks: [step("Do the thing")], baseUpdatedAt: draft.draft.updatedAt.toISOString() });
      await publishDraft(t.db, admin, sop.id, { changeSummary: "First version" });
      return { admin, sop };
    };
    const { admin, sop } = await publish("Doomed");
    const { sop: keep } = await publish("Keeper");
    await startRun(t.db, admin, sop.id, { label: "Sunday" });
    await getOrCreateDraft(t.db, admin, sop.id); // a draft on top of the published version

    await deleteSop(t.db, admin, sop.id);
    await expect(getSopDocument(t.db, admin, sop.id)).rejects.toThrow();
    expect(await t.db.select().from(sopVersions).where(eq(sopVersions.sopId, sop.id))).toHaveLength(0);

    // The purge flag was transaction-local: other published versions still can't be touched.
    const [kv] = await t.db.select().from(sopVersions).where(eq(sopVersions.sopId, keep.id));
    const err = await t.db.delete(sopVersions).where(eq(sopVersions.id, kv.id)).then(() => null, (e) => e);
    expect(isImmutableVersionError(err)).toBe(true);
    const audits = await t.db.select().from(auditEvents).where(eq(auditEvents.targetId, sop.id));
    expect(audits.map((a) => a.action)).toContain("sop.deleted");
  });
});
