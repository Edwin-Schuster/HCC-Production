import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cableSummary, createCable, createLayout, deleteCable, getLayout, listCables, saveLayout, updateCable } from "@/server/services/cabling";
import { createProject } from "@/server/services/projects";
import { listActivity } from "@/server/services/activity";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("cabling", () => {
  it("keeps cable IDs unique per project and summarises footage", async () => {
    const editor = await t.actorFor("editor", "cb-ed");
    const viewer = await t.actorFor("viewer", "cb-vw");
    const p = await createProject(t.db, editor, { name: "Cables" });
    await createCable(t.db, editor, p.id, { label: "NET-001", type: "Cat6A", lengthFt: 95 });
    const b = await createCable(t.db, editor, p.id, { label: "NET-002", type: "Cat6A", lengthFt: 120, status: "tested" });
    await createCable(t.db, editor, p.id, { label: "FO-001", type: "Fiber SM", lengthFt: 180 });
    await expect(createCable(t.db, editor, p.id, { label: "net-001" })).rejects.toThrow(/already a cable labelled/);
    await expect(listCables(t.db, viewer, p.id)).rejects.toThrow(/Only editors/);

    const s = cableSummary(await listCables(t.db, editor, p.id));
    expect(s).toMatchObject({ total: 3, totalFt: 395, byStatus: { planned: 2, tested: 1 } });
    expect(s.byType[0]).toEqual({ type: "Cat6A", ft: 215 });

    await updateCable(t.db, editor, b.id, { label: "NET-002", type: "Cat6A", lengthFt: 120, status: "complete" });
    const [h] = await listActivity(t.db, editor, { targetType: "cable", targetId: b.id });
    expect(h.text).toBe("changed status from “Tested” to “Complete”");
  });

  it("saves layouts, drops runs to missing items, and unlinks deleted cables", async () => {
    const editor = await t.actorFor("editor", "ly-ed");
    const p = await createProject(t.db, editor, { name: "Layouts" });
    const other = await createProject(t.db, editor, { name: "Other" });
    const cable = await createCable(t.db, editor, p.id, { label: "SDI-1" });
    const foreign = await createCable(t.db, editor, other.id, { label: "SDI-9" });
    const l = await createLayout(t.db, editor, p.id, "Main floor");
    const items = [
      { id: "z", type: "zone", label: "Stage", x: 10, y: 10 },
      { id: "a", type: "camera", label: "Cam 1", x: 100, y: 100 },
      { id: "b", type: "rack", label: "Rack", x: 300, y: 300 },
    ];
    const saved = await saveLayout(t.db, editor, l.id, {
      name: "Main floor",
      items,
      runs: [
        { id: "r1", from: "a", to: "b", label: "SDI-1", cableId: cable.id },
        { id: "r2", from: "a", to: "gone" },
      ],
    });
    expect(saved.runs.map((r) => r.id)).toEqual(["r1"]);
    expect(saved.items[0]).toMatchObject({ w: 200, h: 120 });
    await expect(saveLayout(t.db, editor, l.id, { name: "x", items, runs: [{ id: "r", from: "a", to: "b", cableId: foreign.id }] })).rejects.toThrow(/isn't in this project/);
    await expect(saveLayout(t.db, editor, l.id, { name: "x", items: [{ id: "q", type: "spaceship", label: "", x: 0, y: 0 }] })).rejects.toThrow();

    await deleteCable(t.db, editor, cable.id);
    const after = await getLayout(t.db, editor, l.id);
    expect(after.runs[0].cableId).toBeUndefined();
    expect(after.runs[0].label).toBe("SDI-1");
  });
});
