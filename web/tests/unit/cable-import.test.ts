import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cableRows, labelPrefix } from "@/lib/cable-import";
import { readCsv, readXlsx } from "@/lib/xlsx";
import { importCables, listCables } from "@/server/services/cabling";
import { createProject } from "@/server/services/projects";
import { testDb } from "./helpers";

const book = () => readXlsx(new Uint8Array(readFileSync(path.join(__dirname, "../fixtures/cables.xlsx"))));

describe("reading spreadsheets", () => {
  it("reads every sheet of an .xlsx, filling merged cells", () => {
    const sheets = book();
    expect(sheets.map((s) => s.name)).toEqual(["Totals", "Cable Runs V1", "Cable Runs V2"]);
    const v2 = sheets[2].rows;
    expect(v2[0].slice(1, 8)).toEqual(["Area", "Name", "Cable", "Location From", "Location To", "Who", "Notes"]);
    expect(v2[2][1]).toBe("Atrium"); // merged B2:B4
    expect(v2[2][7]).toBe("Countdown & lyrics <TVs>");
  });

  it("reads CSV with quotes, commas and line breaks", () => {
    expect(readCsv('Name,Notes\r\n"Cam, 1","say ""hi""\nthen go"\nB,\n')).toEqual([["Name", "Notes"], ["Cam, 1", 'say "hi"\nthen go'], ["B", ""]]);
  });

  it("finds the columns by heading and carries an area down to the next blank row", () => {
    const { rows, skipped } = cableRows(book()[2].rows)!;
    expect(rows.map((r) => [r.room, r.name])).toEqual([
      ["Atrium", "Atrium Speaker 1"],
      ["Atrium", "Atrium TV 1"],
      ["Atrium", "Camera Stand"],
      ["Sound Stage // Tech Booth", "Data 1"],
      ["Sound Stage // Tech Booth", "Wall Plate Control"],
      ["Sound Stage // Tech Booth", "Wall Plate Control"],
      ["Sound Stage // Tech Booth", "Camera 1 Video 1"],
      ["", "Stage Room Rack Electrical"],
    ]);
    expect(rows[1]).toMatchObject({ type: "Cat6a Riser Ethernet Cable｜Shielded", from: "Mezzanine Server Closet", to: "Atrium", who: "Star", label: "", lengthFt: null, status: null });
    expect(skipped).toBe(0);
    expect(cableRows([["Totals"], ["1", "2"]])).toBeNull();
  });

  it("picks an ID prefix from the cable type", () => {
    expect(["Cat6a Riser Ethernet Cable", "Belden 4694R", "Belden 9451", "70V/100V speaker wire", "Power - Single Gang - 120V", "DMX 5-pin", "OM3 fiber", ""].map(labelPrefix)).toEqual(["NET", "VID", "AUD", "SPK", "PWR", "DMX", "FIB", "CBL"]);
  });
});

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("importing cables into a project", () => {
  it("adds cables with generated IDs, then updates them when the sheet is imported again", async () => {
    const editor = await t.actorFor("editor", "ci-ed");
    const viewer = await t.actorFor("viewer", "ci-vw");
    const p = await createProject(t.db, editor, { name: "Building Project" });
    const { rows } = cableRows(book()[2].rows)!;
    await expect(importCables(t.db, viewer, p.id, rows)).rejects.toThrow(/Only editors/);

    expect(await importCables(t.db, editor, p.id, rows)).toEqual({ created: 8, updated: 0, unchanged: 0 });
    const list = await listCables(t.db, editor, p.id);
    expect(list.map((c) => c.label).sort()).toEqual(["CBL-001", "NET-001", "NET-002", "NET-003", "NET-004", "PWR-001", "SPK-001", "VID-001"]);
    const tv = list.find((c) => c.name === "Atrium TV 1")!;
    expect(tv).toMatchObject({ room: "Atrium", who: "Star", status: "planned", type: "Cat6a Riser Ethernet Cable｜Shielded" });

    // Someone marks a cable pulled in the app, then the sheet changes and is imported again.
    const edited = rows.map((r) => (r.name === "Atrium TV 1" ? { ...r, to: "Atrium North Wall" } : r));
    const { updateCable } = await import("@/server/services/cabling");
    await updateCable(t.db, editor, tv.id, { ...tv, status: "pulled" });
    expect(await importCables(t.db, editor, p.id, [...edited, { ...rows[0], name: "Atrium Speaker 5" }])).toEqual({ created: 1, updated: 1, unchanged: 7 });
    const after = await listCables(t.db, editor, p.id);
    expect(after).toHaveLength(9);
    expect(after.find((c) => c.id === tv.id)).toMatchObject({ to: "Atrium North Wall", status: "pulled", label: tv.label });
    expect(after.find((c) => c.name === "Atrium Speaker 5")?.label).toBe("SPK-002");
  });
});
