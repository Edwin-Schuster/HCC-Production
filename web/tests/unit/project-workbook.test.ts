import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { projectAttention } from "@/lib/attention";
import { contractorGroups, defaultCableTab, readWorkbook } from "@/lib/project-workbook";
import { readXlsx } from "@/lib/xlsx";
import { listCables } from "@/server/services/cabling";
import { listContractors, listScopes } from "@/server/services/contractors";
import { listPorts } from "@/server/services/network";
import { createProjectFromWorkbook, importWorkbook } from "@/server/services/project-import";
import { listBom, listBudgetLines, projectBudget, updateBomItem } from "@/server/services/purchasing";
import { testDb } from "./helpers";

const workbook = () => readWorkbook(readXlsx(new Uint8Array(readFileSync(path.join(__dirname, "../fixtures/project-workbook.xlsx")))));

describe("reading a project workbook", () => {
  it("finds the budget, item tabs with sections, the cable schedule and the network plan", () => {
    const wb = workbook();
    expect(wb.tabs.map((t) => [t.name, t.kind])).toEqual([
      ["Total", "budget"],
      ["Lighting", "items"],
      ["Misc", "items"],
      ["Cable Runs", "cables"],
      ["NETWORKING", "network"],
    ]);
    expect(wb.budget).toEqual([
      { category: "PA System Changes", source: "EKO", budget: 80_000 },
      { category: "Video Walls", source: "EKO", budget: 290_000 },
      { category: "Lighting", source: "HCC", budget: 30_000 },
      { category: "Misc", source: "HCC", budget: 1_000 },
      { category: "Networking", source: "HCC", budget: 0 },
    ]);
    expect(contractorGroups(wb)).toEqual(["EKO"]); // HCC buys its own items
    expect(wb.items.map((i) => [i.section, i.item, i.qty, i.unitCost, i.vendor])).toEqual([
      ["Front Stage Lighting", "Chauvet Pro Ovation E-910FC", 12, 1498, "Full Compass"],
      ["Front Stage Lighting", "ETC SourceFour Lens Tube", 12, 252, ""],
      ["Control", "Obsidian BS10 Remote Station", 4, 185, "B&H"],
      ["Tech Booth", "Chairs", 6, 300, "Amazon"],
    ]);
    expect(wb.cableTabs[defaultCableTab(wb)].rows.map((r) => r.room)).toEqual(["Atrium", "Atrium"]);
    expect(wb.ports.map((p) => [p.switchName, p.port, p.device])).toEqual([
      ["Switch 1 (3-port)", "Port 1", ""],
      ["Switch 1 (3-port)", "Port 2", "D&B 5D"],
      ["Switch 1 (3-port)", "Port 3", ""],
      ["Switch 2 (4-port)", "Port 1", ""],
      ["Switch 2 (4-port)", "Port 2", "Hyperdeck 1"],
      ["Switch 2 (4-port)", "Port 3", "Hyperdeck 2"],
      ["Switch 2 (4-port)", "Port 4", "GFX 1"],
      ["Wi-Fi", "", "Mixing iPad"],
    ]);
    // The merged "Uplink" label on Port 1 stays in the VLAN column only.
    expect(wb.ports[0]).toMatchObject({ vlan: "Default Network | Uplink to Main Switch", ip: "", device: "", mac: "" });
  });
});

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("importing a project workbook", () => {
  it("builds the project, and a second import updates it without duplicates or losing app changes", async () => {
    const editor = await t.actorFor("editor", "wb-ed");
    const wb = workbook();
    const payload = { budget: wb.budget, items: wb.items, contractors: contractorGroups(wb), cables: wb.cableTabs[0].rows, ports: wb.ports };
    const { id } = await createProjectFromWorkbook(t.db, editor, "2027 Worship Center Project", payload);

    expect((await listBudgetLines(t.db, editor, id)).map((l) => l.category)).toEqual(["PA System Changes", "Video Walls", "Lighting", "Misc", "Networking"]);
    const b = await projectBudget(t.db, editor, id);
    expect(b.budget).toBe(40_100_000); // the project budget is the total of its lines
    expect(b.byCategory.find((c) => c.category === "Video Walls")).toMatchObject({ source: "EKO", budgeted: 29_000_000, planned: 29_000_000, committed: 0 });
    expect(b.byCategory.find((c) => c.category === "Misc")).toMatchObject({ budgeted: 100_000, planned: 180_000 });
    const scopes = await listScopes(t.db, editor, { projectId: id });
    expect(scopes.map((s) => [s.company, s.title, s.status, s.category])).toEqual(expect.arrayContaining([["EKO", "Video Walls", "sent", "Video Walls"]]));
    expect(await listCables(t.db, editor, id)).toHaveLength(2);
    expect(await listPorts(t.db, editor, id)).toHaveLength(8);

    // The parts list keeps the workbook's order (sections and items), not alphabetical.
    expect((await listBom(t.db, editor, id)).map((x) => x.item)).toEqual(["Chauvet Pro Ovation E-910FC", "ETC SourceFour Lens Tube", "Obsidian BS10 Remote Station", "Chairs"]);

    // Mark an item ordered in the app, change its price in the workbook, and import again.
    const chairs = (await listBom(t.db, editor, id)).find((x) => x.item === "Chairs")!;
    await updateBomItem(t.db, editor, chairs.id, { item: chairs.item, category: chairs.category, section: chairs.section, qty: chairs.qty, unitCost: 300, status: "ordered" });
    const edited = { ...payload, items: payload.items.map((i) => (i.item === "Chairs" ? { ...i, unitCost: 280 } : i)) };
    const again = await importWorkbook(t.db, editor, id, edited);
    expect(again.items).toEqual({ created: 0, updated: 1 });
    expect(again.cables).toMatchObject({ created: 0 });
    expect(again.ports).toMatchObject({ created: 0 });
    const after = (await listBom(t.db, editor, id)).find((x) => x.id === chairs.id)!;
    expect(after).toMatchObject({ unitCostCents: 28_000, status: "ordered" });
    expect((await listScopes(t.db, editor, { projectId: id })).length).toBe(2);
    expect((await listContractors(t.db, editor)).filter((c) => c.company === "EKO")).toHaveLength(1);
  });
});

describe("needs attention", () => {
  it("lists overspend and duplicate IPs first, then unsigned work, missing insurance and things to do", () => {
    const list = projectAttention({
      base: "/projects/p",
      categories: [
        { category: "Misc", source: "HCC", budgeted: 100_000, planned: 180_000, committed: 0, spent: 0 },
        { category: "Interim gear", source: "", budgeted: null, planned: 680_000, committed: 0, spent: 0 },
      ],
      bom: [{ status: "needed", qty: 6, unitCostCents: 30_000 }, { status: "received", qty: 1, unitCostCents: 0 }],
      scopes: [{ company: "EKO", status: "sent", valueCents: 37_000_000 }],
      contractors: [{ company: "EKO", insuranceExpires: null }],
      ports: [
        { id: "1", switchName: "S", port: "1", vlan: "", ip: "10.0.19.79", device: "Hyperdeck 1" },
        { id: "2", switchName: "S", port: "2", vlan: "", ip: "10.0.19.79", device: "Hyperdeck 2" },
      ],
      cables: [{ status: "planned" }, { status: "pulled" }],
      today: "2026-11-12",
    });
    expect(list.map((a) => [a.tone, a.text])).toEqual([
      ["bad", "Misc is $800 over its $1,000 budget"],
      ["bad", "1 IP address used by more than one device (10.0.19.79)"],
      ["warn", "Interim gear has $6,800 planned but no budget line"],
      ["warn", "EKO: 1 scope of work not signed yet ($370,000)"],
      ["warn", "EKO has no insurance certificate on file"],
      ["warn", "1 item with no price"],
      ["info", "1 item still to order ($1,800)"],
      ["info", "1 cable not pulled yet"],
    ]);
  });
});
