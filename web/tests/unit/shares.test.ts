import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { shareLinks } from "@/db/schema";
import { step } from "@/blocks/build";
import { createSop, getEditorState, publishDraft, saveDraft } from "@/server/services/sops";
import { createShareLink, listShareLinks, openShare, revokeShareLink, unlockShare } from "@/server/services/shares";
import { plain } from "@/blocks/tree";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

async function published(title: string, folderId = t.general.id) {
  const owner = await t.actorFor("admin");
  const sop = await createSop(t.db, owner, { title, folderId });
  await saveDraft(t.db, owner, sop.id, { title, blocks: [step("v1 step")] });
  await publishDraft(t.db, owner, sop.id, { changeSummary: "First version" });
  return { owner, sop };
}
const firstTitle = (s: Awaited<ReturnType<typeof openShare>>) => (s.status === "ok" && s.doc.blocks[0].type === "step" ? plain(s.doc.blocks[0].content.title) : null);

describe("share links", () => {
  it("open the published version without signing in, follow updates unless pinned, and stop working when revoked", async () => {
    const { owner, sop } = await published("Shared");
    const live = await createShareLink(t.db, owner, sop.id, {});
    const pinned = await createShareLink(t.db, owner, sop.id, { pinVersion: true });
    const e = await getEditorState(t.db, owner, sop.id);
    await saveDraft(t.db, owner, sop.id, { title: "Shared", blocks: [step("v2 step")], baseVersionId: e.baseVersionId });
    expect(firstTitle(await openShare(t.db, live.token, undefined))).toBe("v1 step"); // drafts never leak
    await publishDraft(t.db, owner, sop.id, { changeSummary: "Second" });
    expect(firstTitle(await openShare(t.db, live.token, undefined, { count: true }))).toBe("v2 step");
    expect(firstTitle(await openShare(t.db, pinned.token, undefined))).toBe("v1 step");
    const [l] = (await listShareLinks(t.db, owner, sop.id)).filter((x) => x.id === live.id);
    expect(l.viewCount).toBe(1);
    await revokeShareLink(t.db, owner, live.id);
    expect((await openShare(t.db, live.token, undefined)).status).toBe("missing");
  });

  it("enforce passwords and expiry", async () => {
    const { owner, sop } = await published("Locked");
    const l = await createShareLink(t.db, owner, sop.id, { password: "letmein1" });
    expect((await openShare(t.db, l.token, undefined)).status).toBe("locked");
    expect(await unlockShare(t.db, l.token, "wrong")).toBeNull();
    const cookie = await unlockShare(t.db, l.token, "letmein1");
    expect((await openShare(t.db, l.token, cookie!)).status).toBe("ok");
    await t.db.update(shareLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(shareLinks.id, l.id));
    expect((await openShare(t.db, l.token, cookie!)).status).toBe("missing");
  });

  it("can't share drafts, editors-only folders, or be created by viewers", async () => {
    const owner = await t.actorFor("admin");
    const viewer = await t.actorFor("viewer", "share-viewer");
    const draft = await createSop(t.db, owner, { title: "Unpublished", folderId: t.general.id });
    await expect(createShareLink(t.db, owner, draft.id, {})).rejects.toThrow(/Publish the SOP/);
    const secret = await t.folder("Secret", "SEC", "editors");
    const { sop } = await published("Editors only", secret.id);
    await expect(createShareLink(t.db, owner, sop.id, {})).rejects.toThrow(/editors-only/);
    const { sop: open } = await published("Open");
    await expect(createShareLink(t.db, viewer, open.id, {})).rejects.toThrow(/Only editors/);
  });
});
