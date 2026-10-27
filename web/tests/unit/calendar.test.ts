import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/ics";
import { calendarFeed, calendarFeedUrl, rotateCalendarToken } from "@/server/services/calendar";
import { createProject } from "@/server/services/projects";
import { createTask } from "@/server/services/tasks";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("calendar feed", () => {
  it("escapes text and folds long lines", () => {
    const ics = buildIcs("HCC", [{ uid: "a", start: "2026-05-01", end: "2026-05-01", summary: String.raw`Due: Mics; cables, stands \ ok`, description: "x".repeat(120) }]);
    expect(ics).toContain(String.raw`SUMMARY:Due: Mics\; cables\, stands \\ ok`);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260501\r\nDTEND;VALUE=DATE:20260502");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it("is off until an admin turns it on, and a new address retires the old one", async () => {
    const admin = await t.actorFor("admin");
    const editor = await t.actorFor("editor", "cal-ed");
    expect(await calendarFeedUrl(t.db, editor)).toBeNull();
    await expect(rotateCalendarToken(t.db, editor)).rejects.toThrow(/Only admins/);
    const token = (await rotateCalendarToken(t.db, admin))!;
    expect(await calendarFeedUrl(t.db, editor)).toBe(`/calendar.ics?token=${token}`);

    const p = await createProject(t.db, editor, { name: "Feed project", start: "2026-06-01", end: "2026-06-30" });
    await createTask(t.db, editor, { projectId: p.id, title: "Order racks", due: "2026-06-10" });
    await createTask(t.db, editor, { projectId: p.id, title: "Finished", due: "2026-06-11", status: "done" });
    const ics = (await calendarFeed(t.db, token, "https://hcc.example.org"))!;
    expect(ics).toContain("SUMMARY:Due: Order racks");
    expect(ics).not.toContain("Finished");
    expect(ics).toContain("SUMMARY:Project: Feed project");
    expect(ics).toContain("URL:https://hcc.example.org/projects/");

    await rotateCalendarToken(t.db, admin);
    expect(await calendarFeed(t.db, token, "x")).toBeNull();
    await rotateCalendarToken(t.db, admin, false);
    expect(await calendarFeedUrl(t.db, editor)).toBeNull();
  });
});
