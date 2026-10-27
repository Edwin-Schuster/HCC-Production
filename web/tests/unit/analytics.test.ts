import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { step } from "@/blocks/build";
import { createSop, publishDraft, saveDraft } from "@/server/services/sops";
import { checkStep, finishRun, getRun, startRun } from "@/server/services/runs";
import { getAnalytics, recordView } from "@/server/services/analytics";
import { submitFeedback } from "@/server/services/feedback";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("analytics", () => {
  it("counts reads once per person per half hour, and reports skipped steps, run times and feedback", async () => {
    const owner = await t.actorFor("editor", "an-owner");
    const reader = await t.actorFor("viewer", "an-reader");
    const sop = await createSop(t.db, owner, { title: "Counted", folderId: t.general.id });
    const s1 = step("Do this", { minutes: 5 });
    await saveDraft(t.db, owner, sop.id, { title: "Counted", blocks: [s1, step("Often skipped")] });
    await publishDraft(t.db, owner, sop.id, { changeSummary: "First version" });

    await recordView(t.db, reader, sop.id);
    await recordView(t.db, reader, sop.id);
    await recordView(t.db, owner, sop.id);
    const { id } = await startRun(t.db, reader, sop.id, {});
    const r = await getRun(t.db, reader, id);
    await checkStep(t.db, reader, id, { blockId: r.doc.blocks[0].id, done: true });
    await finishRun(t.db, reader, id, "completed");
    await submitFeedback(t.db, reader, sop.id, { blockKey: s1.key, type: "wrong", message: "x" });

    const a = await getAnalytics(t.db, owner, 30);
    expect(a.totals).toMatchObject({ views: 2, readers: 2, runsCompleted: 1, openFeedback: 1 });
    expect(a.topSops[0]).toMatchObject({ id: sop.id, views: 2 });
    expect(a.skipped[0]).toMatchObject({ label: "Step 2: Often skipped", skipped: 1, runs: 1 });
    expect(a.runTimes[0]).toMatchObject({ runs: 1, estimatedMinutes: 5 });
    expect(a.feedback[0]).toMatchObject({ wrong: 1, open: 1 });
    expect(a.daily).toHaveLength(30);
    await expect(getAnalytics(t.db, reader)).rejects.toThrow(/Only editors/);
  });
});
