import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseSheetUrl, sheetEditUrl } from "@/lib/sheets";
import { createProject, loadProject, setBudgetSheet } from "@/server/services/projects";
import { testDb } from "./helpers";

const ID = "1_KkJOYGKyhAlCgzB1ROgPMZ125UpZTFqN0hddbTA88E";

describe("Google Sheets links", () => {
  it("reads share, edit and tab links, and refuses anything else", () => {
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`)).toEqual({ id: ID, gid: null });
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=12345`)).toEqual({ id: ID, gid: "12345" });
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/u/1/d/${ID}/view?gid=7`)).toEqual({ id: ID, gid: "7" });
    expect(parseSheetUrl("https://evil.example/spreadsheets/d/" + ID)).toBeNull();
    expect(parseSheetUrl(`http://docs.google.com/spreadsheets/d/${ID}/edit`)).toBeNull();
    expect(parseSheetUrl("javascript:alert(1)")).toBeNull();
    expect(sheetEditUrl({ id: ID, gid: "5" })).toBe(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=5`);
  });
});

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("project budget spreadsheet", () => {
  it("is linked and removed by editors only, stored as a clean edit link", async () => {
    const editor = await t.actorFor("editor", "sh-ed");
    const viewer = await t.actorFor("viewer", "sh-vw");
    const p = await createProject(t.db, editor, { name: "Worship Center Remodel" });
    await expect(setBudgetSheet(t.db, viewer, p.id, `https://docs.google.com/spreadsheets/d/${ID}/edit`)).rejects.toThrow(/Only editors/);
    await expect(setBudgetSheet(t.db, editor, p.id, "https://example.com/sheet")).rejects.toThrow(/Google Sheets link/);
    await setBudgetSheet(t.db, editor, p.id, `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`);
    expect((await loadProject(t.db, editor, p.id)).budgetSheetUrl).toBe(`https://docs.google.com/spreadsheets/d/${ID}/edit`);
    await setBudgetSheet(t.db, editor, p.id, null);
    expect((await loadProject(t.db, editor, p.id)).budgetSheetUrl).toBeNull();
  });
});
