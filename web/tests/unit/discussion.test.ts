import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { notifications } from "@/db/schema";
import { step } from "@/blocks/build";
import { plain } from "@/blocks/tree";
import { createSop, getSopDocument, publishDraft, saveDraft } from "@/server/services/sops";
import { listFeedback, resolveFeedback, submitFeedback } from "@/server/services/feedback";
import { acceptSuggestion, addComment, listThreads, rejectSuggestion, setResolved } from "@/server/services/comments";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

async function published(prefix: string) {
  const owner = await t.actorFor("editor", `${prefix}-owner`);
  const reader = await t.actorFor("viewer", `${prefix}-reader`);
  const sop = await createSop(t.db, owner, { title: `${prefix} SOP`, folderId: t.general.id });
  const s1 = step("Power on the console", { expected: "Lights come on" });
  await saveDraft(t.db, owner, sop.id, { title: `${prefix} SOP`, blocks: [s1, step("Load the show")] });
  await publishDraft(t.db, owner, sop.id, { changeSummary: "First version" });
  return { owner, reader, sop, key: s1.key };
}

const inbox = (userId: string, kind: string) => t.db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.kind, kind)));

describe("step feedback", () => {
  it("reaches the owner, is labelled with the step, and the reader hears back", async () => {
    const { owner, reader, sop, key } = await published("fb");
    await submitFeedback(t.db, reader, sop.id, { blockKey: key, type: "unclear", message: "Which switch?" });
    expect(await inbox(owner.userId!, "feedback")).toHaveLength(1);
    const [f] = await listFeedback(t.db, owner, sop.id);
    expect(f).toMatchObject({ blockLabel: "Step 1: Power on the console", type: "unclear", status: "open", versionNumber: 1 });
    await expect(resolveFeedback(t.db, reader, f.id, { status: "accepted" })).rejects.toThrow(/Only editors/);
    await resolveFeedback(t.db, owner, f.id, { status: "accepted", note: "Added a photo" });
    expect(await inbox(reader.userId!, "feedback_resolved")).toHaveLength(1);
  });

  it("rejects unknown steps and signed-out readers", async () => {
    const { sop } = await published("fb2");
    const reader = await t.actorFor("viewer", "fb2-other");
    await expect(submitFeedback(t.db, reader, sop.id, { blockKey: "nope", type: "wrong" })).rejects.toThrow(/isn't in the current version/);
    await expect(submitFeedback(t.db, t.publicActor, sop.id, { blockKey: "nope", type: "wrong" })).rejects.toThrow(/Sign in/);
  });
});

describe("comments", () => {
  it("thread replies and notify @mentions and participants", async () => {
    const { owner, reader, sop, key } = await published("cm");
    const other = await t.actorFor("editor", "cm-other");
    const { id } = await addComment(t.db, reader, sop.id, { body: "Is this before or after the amps? @cm-other", blockKey: key });
    expect(await inbox(other.userId!, "mention")).toHaveLength(1);
    expect(await inbox(owner.userId!, "comment")).toHaveLength(1);
    await addComment(t.db, owner, sop.id, { body: "Before.", parentId: id });
    expect(await inbox(reader.userId!, "comment")).toHaveLength(1);
    const [thread] = await listThreads(t.db, reader, sop.id);
    expect(thread.replies.map((r) => r.body)).toEqual(["Before."]);
    await setResolved(t.db, reader, id, true);
    expect((await listThreads(t.db, owner, sop.id))[0].resolvedAt).not.toBeNull();
  });

  it("suggested edits are applied to the draft when accepted, never to the published version", async () => {
    const { owner, reader, sop, key } = await published("sg");
    const { id } = await addComment(t.db, reader, sop.id, { body: "Clearer wording", blockKey: key, suggestion: { field: "title", after: "Power on the audio console" } });
    await expect(acceptSuggestion(t.db, reader, id)).rejects.toThrow(/Only editors/);
    await acceptSuggestion(t.db, owner, id);
    const draft = await getSopDocument(t.db, owner, sop.id, "draft");
    const live = await getSopDocument(t.db, owner, sop.id);
    const title = (d: typeof draft) => (d.blocks[0].type === "step" ? plain(d.blocks[0].content.title) : "");
    expect(title(draft)).toBe("Power on the audio console");
    expect(title(live)).toBe("Power on the console");
    expect(await inbox(reader.userId!, "suggestion_resolved")).toHaveLength(1);
    await expect(acceptSuggestion(t.db, owner, id)).rejects.toThrow(/already handled/);
  });

  it("refuses to apply a suggestion whose text changed since, and can be rejected", async () => {
    const { owner, reader, sop, key } = await published("sg2");
    const a = await addComment(t.db, reader, sop.id, { body: "x", blockKey: key, suggestion: { field: "expectedResult", after: "All lights green" } });
    const b = await addComment(t.db, reader, sop.id, { body: "y", blockKey: key, suggestion: { field: "expectedResult", after: "Meters move" } });
    await acceptSuggestion(t.db, owner, a.id);
    await expect(acceptSuggestion(t.db, owner, b.id)).rejects.toThrow(/text changed/);
    await rejectSuggestion(t.db, owner, b.id);
    const threads = await listThreads(t.db, owner, sop.id);
    expect(threads.map((th) => th.suggestionStatus)).toEqual(["accepted", "rejected"]);
  });
});
