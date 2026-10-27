import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bomItems, invoices, scopesOfWork, contractors } from "@/db/schema";
import { budgetFor, deriveStatus } from "@/lib/purchasing";
import { createProject } from "@/server/services/projects";
import { createBomItem, createPurchaseOrder, listPurchaseOrders, nextPoNumber, projectBudget, receivePurchaseOrder, updatePurchaseOrder } from "@/server/services/purchasing";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("budget arithmetic", () => {
  it("rolls up planned, committed and spent by category", () => {
    const b = budgetFor({
      budgetCents: 1_000_000,
      bom: [
        { category: "Video", qty: 2, unitCostCents: 429_500 },
        { category: "Cabling", qty: 250, unitCostCents: 240 },
      ],
      pos: [
        { category: "Video", status: "received", lines: [{ qty: 2, unitCostCents: 429_500, receivedQty: 2 }] },
        { category: "Cabling", status: "partially_received", lines: [{ qty: 250, unitCostCents: 240, receivedQty: 100 }, { qty: 2, unitCostCents: 14_500, receivedQty: 0 }] },
        { category: "Audio", status: "draft", lines: [{ qty: 1, unitCostCents: 999_999, receivedQty: 0 }] },
      ],
      sows: [{ status: "signed", valueCents: 120_000 }, { status: "draft", valueCents: 50_000 }],
      invoices: [{ status: "paid", amountCents: 40_000 }, { status: "approved", amountCents: 80_000 }],
    });
    expect(b).toMatchObject({ planned: 919_000, committed: 859_000 + 60_000 + 29_000 + 120_000, spent: 859_000 + 24_000 + 40_000 });
    expect(b.remaining).toBe(1_000_000 - b.committed);
    expect(b.byCategory.find((c) => c.category === "Labor")).toEqual({ category: "Labor", planned: 0, committed: 120_000, spent: 40_000 });
    expect(b.byCategory.find((c) => c.category === "Audio")).toBeUndefined();
  });

  it("derives receiving status from the lines", () => {
    const l = (qty: number, receivedQty: number) => ({ qty, unitCostCents: 1, receivedQty });
    expect(deriveStatus("ordered", [l(2, 2), l(1, 1)])).toBe("received");
    expect(deriveStatus("ordered", [l(2, 1)])).toBe("partially_received");
    expect(deriveStatus("received", [l(2, 0)])).toBe("ordered");
    expect(deriveStatus("draft", [l(2, 2)])).toBe("draft");
  });
});

describe("purchasing", () => {
  it("numbers POs, receives them, and marks BOM items ordered then received", async () => {
    const editor = await t.actorFor("editor", "po-ed");
    const viewer = await t.actorFor("viewer", "po-vw");
    const p = await createProject(t.db, editor, { name: "PO project", budget: 20000 });
    const cam = await createBomItem(t.db, editor, p.id, { item: "PTZ camera", category: "Video", qty: 2, unitCost: 4295 });
    const fiber = await createBomItem(t.db, editor, p.id, { item: "Fiber (ft)", category: "Cabling", qty: 250, unitCost: 2.4 });
    await expect(listPurchaseOrders(t.db, viewer)).rejects.toThrow(/Only editors/);

    const number = await nextPoNumber(t.db, editor, 2026);
    expect(number).toBe("PO-2026-001");
    const po = await createPurchaseOrder(t.db, editor, p.id, {
      poNumber: number,
      vendor: "B&H",
      category: "Video",
      status: "submitted",
      lines: [
        { desc: "PTZ camera", qty: 2, unitCost: 4295, bomItemId: cam.id },
        { desc: "fiber (ft)", qty: 250, unitCost: 2.4 },
      ],
    });
    expect(po.totalCents).toBe(859_000 + 60_000);
    expect(await nextPoNumber(t.db, editor, 2026)).toBe("PO-2026-002");
    await expect(createPurchaseOrder(t.db, editor, p.id, { poNumber: "po-2026-001" })).rejects.toThrow(/already used/);

    const [l1, l2] = po.lines;
    await receivePurchaseOrder(t.db, editor, po.id, { received: { [l1.id]: 2 }, date: "2026-05-01" });
    let [after] = await listPurchaseOrders(t.db, editor, p.id);
    expect(after.status).toBe("partially_received");
    const statusOf = async (id: string) => (await t.db.select().from(bomItems).where(eq(bomItems.id, id)))[0].status;
    expect(await statusOf(cam.id)).toBe("received");
    expect(await statusOf(fiber.id)).toBe("ordered"); // matched by name

    await receivePurchaseOrder(t.db, editor, po.id, { received: { [l2.id]: 999 }, date: "2026-05-03" });
    [after] = await listPurchaseOrders(t.db, editor, p.id);
    expect(after).toMatchObject({ status: "received", receivedDate: "2026-05-03", receivedCents: after.totalCents });
    expect(after.lines[1].receivedQty).toBe(250);
    expect(await statusOf(fiber.id)).toBe("received");

    // Editing a received PO's lines (one returned) moves it back to partially received.
    await updatePurchaseOrder(t.db, editor, po.id, { ...after, lines: after.lines.map((l, i) => ({ ...l, unitCost: l.unitCostCents / 100, receivedQty: i === 0 ? 1 : l.receivedQty })) });
    [after] = await listPurchaseOrders(t.db, editor, p.id);
    expect(after.status).toBe("partially_received");
  });

  it("includes contractor work in the project budget", async () => {
    const editor = await t.actorFor("editor", "bud-ed");
    const p = await createProject(t.db, editor, { name: "Budget", budget: 10000 });
    await createBomItem(t.db, editor, p.id, { item: "Mixer", category: "Audio", qty: 1, unitCost: 3000 });
    const [c] = await t.db.insert(contractors).values({ workspaceId: editor.workspaceId, company: "Sparks" }).returning();
    await t.db.insert(scopesOfWork).values({ workspaceId: editor.workspaceId, contractorId: c.id, projectId: p.id, title: "Wiring", status: "signed", valueCents: 250_000 });
    await t.db.insert(invoices).values({ workspaceId: editor.workspaceId, contractorId: c.id, projectId: p.id, number: "1", amountCents: 100_000, status: "paid" });
    expect(await projectBudget(t.db, editor, p.id)).toMatchObject({ budget: 1_000_000, planned: 300_000, committed: 250_000, spent: 100_000, remaining: 750_000 });
  });
});
