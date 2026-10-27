import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditEvents, snippetVersions } from "@/db/schema";
import { isImmutableVersionError } from "@/db";
import { snippetRef, step } from "@/blocks/build";
import { expandSnippets } from "@/blocks/snippets";
import { numberSteps } from "@/blocks/tree";
import { createSop, getSopDocument, publishDraft, saveDraft } from "@/server/services/sops";
import { createSnippet, deleteSnippet, updateSnippet } from "@/server/services/snippets";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

const titles = (doc: Awaited<ReturnType<typeof getSopDocument>>) => {
  const n = numberSteps(doc.blocks);
  const out: string[] = [];
  const visit = (list: typeof doc.blocks) =>
    list.forEach((b) => {
      if (b.type === "step") out.push(`${n.get(b.id)} ${b.content.title[0]?.text}`);
      visit(b.children);
    });
  visit(doc.blocks);
  return out;
};

describe("snippets", () => {
  it("expand into the SOP and continue its step numbering", async () => {
    const admin = await t.actorFor("admin");
    const snip = await createSnippet(t.db, admin, { name: "Amps off", blocks: [step("Mute"), step("Amps off")] });
    const sop = await createSop(t.db, admin, { title: "Shutdown", folderId: t.general.id });
    await saveDraft(t.db, admin, sop.id, { title: "Shutdown", blocks: [step("Save show"), snippetRef(snip.id), step("Lock up")] });
    await publishDraft(t.db, admin, sop.id, { changeSummary: "First version" });
    expect(titles(await getSopDocument(t.db, admin, sop.id))).toEqual(["1 Save show", "2 Mute", "3 Amps off", "4 Lock up"]);
  });

  it("update following SOPs, audit the change, and leave pinned SOPs alone", async () => {
    const admin = await t.actorFor("admin");
    const snip = await createSnippet(t.db, admin, { name: "Batteries", blocks: [step("Old battery rule")] });
    const following = await createSop(t.db, admin, { title: "Follows latest", folderId: t.general.id });
    const pinned = await createSop(t.db, admin, { title: "Pinned", folderId: t.general.id });
    await saveDraft(t.db, admin, following.id, { title: "Follows latest", blocks: [snippetRef(snip.id)] });
    await saveDraft(t.db, admin, pinned.id, { title: "Pinned", blocks: [snippetRef(snip.id, 1)] });
    await publishDraft(t.db, admin, following.id, { changeSummary: "First version" });
    await publishDraft(t.db, admin, pinned.id, { changeSummary: "First version" });

    const res = await updateSnippet(t.db, admin, snip.id, { name: "Batteries", blocks: [step("New battery rule")] });
    expect(res).toEqual({ version: 2, affectedSops: 1 });
    expect(titles(await getSopDocument(t.db, admin, following.id))).toEqual(["1 New battery rule"]);
    expect(titles(await getSopDocument(t.db, admin, pinned.id))).toEqual(["1 Old battery rule"]);

    const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.targetId, following.id), eq(auditEvents.action, "sop.snippet_updated")));
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({ snippetId: snip.id, snippetVersion: 2 });
  });

  it("keep saved versions immutable in the database", async () => {
    const admin = await t.actorFor("admin");
    const snip = await createSnippet(t.db, admin, { name: "Frozen", blocks: [step("a")] });
    await expect(t.db.update(snippetVersions).set({ blocks: [] }).where(eq(snippetVersions.snippetId, snip.id))).rejects.toSatisfy(isImmutableVersionError);
  });

  it("can't contain other snippets, can't be deleted while used, and are editor-only", async () => {
    const admin = await t.actorFor("admin");
    const viewer = await t.actorFor("viewer", "snippet-viewer");
    const snip = await createSnippet(t.db, admin, { name: "In use", blocks: [step("a")] });
    await expect(createSnippet(t.db, admin, { name: "Nested", blocks: [snippetRef(snip.id)] })).rejects.toThrow(/can't contain another snippet/);
    await expect(createSnippet(t.db, viewer, { name: "Nope", blocks: [] })).rejects.toThrow(/Only editors/);
    const sop = await createSop(t.db, admin, { title: "Uses it", folderId: t.general.id });
    await saveDraft(t.db, admin, sop.id, { title: "Uses it", blocks: [snippetRef(snip.id)] });
    await expect(deleteSnippet(t.db, admin, snip.id)).rejects.toThrow(/used by 1 SOP/);
  });

  it("show a placeholder rather than failing when a snippet is missing", () => {
    const ref = snippetRef("missing");
    const { blocks, snippets } = expandSnippets([ref], () => null);
    expect(blocks[0].children).toEqual([]);
    expect(snippets).toEqual({});
  });
});
