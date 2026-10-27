import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, today } from "@/lib/work";
import { listActivity } from "@/server/services/activity";
import { calendarFeed, rotateCalendarToken } from "@/server/services/calendar";
import { createContractor, deleteContractor, getContractor, insuranceState, insuranceWarnings, listAccess, listContractors, listPunch, saveAccess, saveInvoice, savePunch, saveScope } from "@/server/services/contractors";
import { createProject } from "@/server/services/projects";
import { projectBudget } from "@/server/services/purchasing";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("contractors", () => {
  it("rates insurance and warns 30 days ahead", async () => {
    expect(insuranceState(null, "2026-06-01")).toBe("none");
    expect(insuranceState("2026-05-31", "2026-06-01")).toBe("expired");
    expect(insuranceState("2026-06-20", "2026-06-01")).toBe("expiring");
    expect(insuranceState("2026-09-01", "2026-06-01")).toBe("ok");
    const editor = await t.actorFor("editor", "ins-ed");
    await createContractor(t.db, editor, { company: "Soon Co", insuranceExpires: addDays(today(), 10) });
    await createContractor(t.db, editor, { company: "Fine Co", insuranceExpires: addDays(today(), 200) });
    expect((await insuranceWarnings(t.db, editor)).map((w) => w.company)).toEqual(["Soon Co"]);
  });

  it("tracks punch items, invoices and scopes, and feeds the budget", async () => {
    const editor = await t.actorFor("editor", "con-ed");
    const viewer = await t.actorFor("viewer", "con-vw");
    await expect(listContractors(t.db, viewer)).rejects.toThrow(/Only editors/);
    const p = await createProject(t.db, editor, { name: "Contracted", budget: 50000 });
    const c = await createContractor(t.db, editor, { company: "Summit Rigging", email: "a@summit.example" });
    await expect(createContractor(t.db, editor, { company: "Bad", email: "nope" })).rejects.toThrow(/email/);

    const punch = await savePunch(t.db, editor, { projectId: p.id, contractorId: c.id, description: "Cover plate missing", location: "Booth" });
    await savePunch(t.db, editor, { projectId: p.id, contractorId: c.id, description: "Cover plate missing", location: "Booth", status: "closed" }, punch.id);
    const [h] = await listActivity(t.db, editor, { targetType: "punch", targetId: punch.id });
    expect(h.text).toBe("changed status from “Open” to “Closed”");
    expect(await listPunch(t.db, editor, { open: true, projectId: p.id })).toEqual([]);

    await saveScope(t.db, editor, { contractorId: c.id, projectId: p.id, title: "Hang the array", status: "signed", value: 12500, body: "## Scope\n- Fly it" });
    await saveInvoice(t.db, editor, { contractorId: c.id, projectId: p.id, number: "SR-1", amount: 6250, status: "paid" });
    await saveInvoice(t.db, editor, { contractorId: c.id, projectId: p.id, number: "SR-2", amount: 1000, status: "approved" });
    expect(await projectBudget(t.db, editor, p.id)).toMatchObject({ committed: 1_250_000, spent: 625_000 });
    expect(await getContractor(t.db, editor, c.id)).toMatchObject({ openPunch: 0, unpaidCents: 100_000 });

    await expect(saveAccess(t.db, editor, { contractorId: c.id, who: "Crew", from: "2026-06-10", to: "2026-06-01" })).rejects.toThrow(/before the first/);
    await saveAccess(t.db, editor, { contractorId: c.id, who: "Summit crew (4)", from: addDays(today(), 3), to: addDays(today(), 5), areas: "Sanctuary" });
    await saveAccess(t.db, editor, { contractorId: c.id, who: "Old visit", from: addDays(today(), -20) });
    expect((await listAccess(t.db, editor, { upcoming: true })).map((a) => a.who)).toEqual(["Summit crew (4)"]);

    const admin = await t.actorFor("admin");
    const token = (await rotateCalendarToken(t.db, admin))!;
    expect(await calendarFeed(t.db, token, "https://x.example")).toContain("SUMMARY:Site access: Summit crew (4)");

    await deleteContractor(t.db, editor, c.id);
    expect((await listPunch(t.db, editor, { projectId: p.id }))[0].contractorId).toBeNull();
  });
});
