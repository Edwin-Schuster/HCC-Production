import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { step } from "@/blocks/build";
import { canEditSop, canManageSop, canReadSop, canViewFolder, type Actor } from "@/server/permissions";
import { createFolder } from "@/server/services/folders";
import { createSop, getOrCreateDraft, getSopDocument, listSops, publishDraft, saveDraft, setRetired, updateSopMeta } from "@/server/services/sops";
import { searchSops } from "@/server/services/search";
import { testDb } from "./helpers";

const a = (role: Actor["role"], userId: string | null = "u1"): Actor => ({ role, userId, name: "x", username: "x", workspaceId: "w" });
const published = { ownerId: "owner", status: "published", currentVersionId: "v1" };
const draftOnly = { ownerId: "owner", status: "draft", currentVersionId: null };

describe("permission rules", () => {
  it("folder visibility", () => {
    expect(canViewFolder(a("public"), "public")).toBe(true);
    expect(canViewFolder(a("public"), "members")).toBe(false);
    expect(canViewFolder(a("viewer"), "members")).toBe(true);
    expect(canViewFolder(a("viewer"), "editors")).toBe(false);
    expect(canViewFolder(a("editor"), "editors")).toBe(true);
  });
  it("readers only see published, non-retired SOPs", () => {
    expect(canReadSop(a("viewer"), published, "members")).toBe(true);
    expect(canReadSop(a("viewer"), draftOnly, "members")).toBe(false);
    expect(canReadSop(a("viewer"), { ...published, status: "retired" }, "members")).toBe(false);
    expect(canReadSop(a("editor"), draftOnly, "members")).toBe(true);
    expect(canReadSop(a("public"), published, "members")).toBe(false);
  });
  it("editing and managing", () => {
    expect(canEditSop(a("viewer"), published, "members")).toBe(false);
    expect(canEditSop(a("editor"), published, "members")).toBe(true);
    expect(canEditSop(a("editor"), { ...published, status: "retired" }, "members")).toBe(false);
    expect(canManageSop(a("editor", "owner"), published)).toBe(true);
    expect(canManageSop(a("editor", "someone"), published)).toBe(false);
    expect(canManageSop(a("admin", "someone"), published)).toBe(true);
  });
});

describe("services enforce permissions", () => {
  let t: Awaited<ReturnType<typeof testDb>>;
  beforeAll(async () => { t = await testDb(); });
  afterAll(async () => { await t.close(); });

  it("viewers and the public can't write, and can't see drafts or hidden folders", async () => {
    const admin = await t.actorFor("admin");
    const editor = await t.actorFor("editor", "ed");
    const viewer = await t.actorFor("viewer", "vi");
    const pub = await createFolder(t.db, admin, { name: "Public", codePrefix: "PUB", visibility: "public" });
    const secret = await createFolder(t.db, admin, { name: "Secret", codePrefix: "SEC", visibility: "editors" });
    await expect(createFolder(t.db, editor, { name: "X", codePrefix: "XX" })).rejects.toMatchObject({ status: 403 });
    await expect(createSop(t.db, viewer, { title: "nope", folderId: pub.id })).rejects.toMatchObject({ status: 403 });

    const open = await createSop(t.db, editor, { title: "Open procedure", folderId: pub.id });
    const hidden = await createSop(t.db, editor, { title: "Hidden procedure", folderId: secret.id });
    for (const s of [open, hidden]) {
      await saveDraft(t.db, editor, s.id, { title: s.id === open.id ? "Open procedure" : "Hidden procedure", blocks: [step("Check the breaker panel")] });
    }
    // Draft only: invisible to viewers and the public.
    await expect(getSopDocument(t.db, viewer, open.id)).rejects.toMatchObject({ status: 404 });
    await publishDraft(t.db, editor, open.id, { changeSummary: "First version" });
    await publishDraft(t.db, editor, hidden.id, { changeSummary: "First version" });

    expect((await getSopDocument(t.db, t.publicActor, open.id)).sop.title).toBe("Open procedure");
    await expect(getSopDocument(t.db, viewer, hidden.id)).rejects.toMatchObject({ status: 404 });
    await expect(getSopDocument(t.db, viewer, open.id, "draft")).rejects.toMatchObject({ status: 403 });
    await expect(getOrCreateDraft(t.db, viewer, open.id)).rejects.toMatchObject({ status: 403 });
    await expect(saveDraft(t.db, viewer, open.id, { title: "x", blocks: [] })).rejects.toMatchObject({ status: 403 });
    await expect(publishDraft(t.db, t.publicActor, open.id, { changeSummary: "evil" })).rejects.toMatchObject({ status: 403 });

    expect((await listSops(t.db, viewer)).map((s) => s.title)).toEqual(["Open procedure"]);
    expect((await listSops(t.db, editor)).map((s) => s.title).sort()).toEqual(["Hidden procedure", "Open procedure"]);
    expect((await searchSops(t.db, viewer, { q: "breaker" })).map((r) => r.title)).toEqual(["Open procedure"]);

    // Only owner/admin can hand over ownership or retire.
    const other = await t.actorFor("editor", "ed2");
    await expect(updateSopMeta(t.db, other, open.id, { ownerId: other.userId! })).rejects.toMatchObject({ status: 403 });
    await expect(setRetired(t.db, other, open.id, true)).rejects.toMatchObject({ status: 403 });
    await setRetired(t.db, editor, open.id, true);
    await expect(getSopDocument(t.db, viewer, open.id)).rejects.toMatchObject({ status: 404 });
    await expect(getOrCreateDraft(t.db, editor, open.id)).rejects.toMatchObject({ status: 403 });
  });
});
