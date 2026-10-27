import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { check, step } from "@/blocks/build";
import { createSop, publishDraft, saveDraft, setRetired } from "@/server/services/sops";
import { checkStep, finishRun, getRun, listRuns, noteStep, startRun } from "@/server/services/runs";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

async function runnable(prefix: string) {
  const owner = await t.actorFor("editor", `${prefix}-owner`);
  const viewer = await t.actorFor("viewer", `${prefix}-viewer`);
  const sop = await createSop(t.db, owner, { title: `${prefix} SOP`, folderId: t.general.id });
  await saveDraft(t.db, owner, sop.id, { title: `${prefix} SOP`, blocks: [check("Key"), step("One", {}, [step("One-a")]), step("Two")] });
  await publishDraft(t.db, owner, sop.id, { changeSummary: "First version" });
  return { owner, viewer, sop };
}

describe("runs", () => {
  it("tick steps and checklist items, keep notes, and record unticked steps as skipped on finish", async () => {
    const { owner, viewer, sop } = await runnable("rn");
    const { id } = await startRun(t.db, viewer, sop.id, { label: "9:00" });
    let r = await getRun(t.db, viewer, id);
    expect(r.total).toBe(4);
    const [key, one] = [r.doc.blocks[0], r.doc.blocks[1]];
    await checkStep(t.db, viewer, id, { blockId: key.id, done: true });
    await checkStep(t.db, owner, id, { blockId: one.id, done: true }); // a teammate helps
    await noteStep(t.db, viewer, id, one.children[0].id, "Fan was loud");
    r = await getRun(t.db, viewer, id);
    expect(r.done).toBe(2);
    expect(r.state[one.id].completedByName).toBe("rn-owner");
    expect(r.state[one.children[0].id].note).toBe("Fan was loud");

    await finishRun(t.db, viewer, id, "completed");
    r = await getRun(t.db, viewer, id);
    expect(r.run.status).toBe("completed");
    expect(Object.values(r.state).filter((s) => s.skipped)).toHaveLength(2);
    await expect(checkStep(t.db, viewer, id, { blockId: key.id, done: false })).rejects.toThrow(/finished/);
    const [summary] = await listRuns(t.db, owner, { sopId: sop.id });
    expect(summary).toMatchObject({ label: "9:00", done: 2, skipped: 2, versionNumber: 1 });
  });

  it("only the starter or an editor can finish, and retired SOPs can't be run", async () => {
    const { owner, viewer, sop } = await runnable("rn2");
    const other = await t.actorFor("viewer", "rn2-other");
    const { id } = await startRun(t.db, viewer, sop.id, {});
    await expect(finishRun(t.db, other, id, "completed")).rejects.toThrow(/Only the person who started/);
    await finishRun(t.db, owner, id, "abandoned");
    await expect(checkStep(t.db, viewer, id, { blockId: "x", done: true })).rejects.toThrow(/finished/);
    await setRetired(t.db, owner, sop.id, true);
    await expect(startRun(t.db, owner, sop.id, {})).rejects.toThrow(/Only published/);
  });

  it("rejects blocks that aren't steps in the run's version", async () => {
    const { viewer, sop } = await runnable("rn3");
    const { id } = await startRun(t.db, viewer, sop.id, {});
    await expect(checkStep(t.db, viewer, id, { blockId: "not-a-block", done: true })).rejects.toThrow(/isn't part of this run/);
  });
});
