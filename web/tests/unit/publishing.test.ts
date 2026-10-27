import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { blocks, sopVersions, auditEvents } from "@/db/schema";
import { isImmutableVersionError } from "@/db";
import { callout, step } from "@/blocks/build";
import { createSop, getOrCreateDraft, getSopDocument, listVersions, publishDraft, saveDraft, discardDraft, deleteSop, updateSopMeta } from "@/server/services/sops";
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
    // Deleting a published SOP is refused by the service (retire instead).
    await expect(deleteSop(t.db, admin, sop.id)).rejects.toThrow(/retire/i);
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
