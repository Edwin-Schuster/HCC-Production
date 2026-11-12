import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gear, layouts } from "@/db/schema";
import { DEFAULT_ROOMS } from "@/lib/public-site";
import { createLayout } from "@/server/services/cabling";
import { createGear } from "@/server/services/gear";
import { createProject } from "@/server/services/projects";
import { publicRoom, publicRoomList, publicServiceCards, saveRoom, saveService, saveSiteText, setGearPublic, siteForEditing, siteText } from "@/server/services/public-site";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

// Values that must never appear on a public page.
const SECRETS = ["SN-SECRET-4471", "10.0.19.250", "AA:BB:CC:DD:EE:F1", "HCC-A-SECRET", "internal note: replace mic grilles", "fw-9.9.9-secret", "backup.cfg"];

describe("public site", () => {
  it("starts with default text, services and rooms that anyone can read", async () => {
    const text = await siteText(t.db, t.publicActor);
    expect(text.heroTitle).toBe("HCC Production");
    expect(text.heroIntro).toMatch(/sound, video, livestream, lighting and event support/);
    expect(text.guestsBody).toMatch(/Advance checklist/);
    expect((await publicServiceCards(t.db, t.publicActor)).map((s) => s.title)).toContain("Livestream & recording");
    expect((await publicRoomList(t.db, t.publicActor)).map((r) => r.name)).toEqual(DEFAULT_ROOMS);
  });

  it("is edited by editors only", async () => {
    const viewer = await t.actorFor("viewer", "ps-vw");
    const editor = await t.actorFor("editor", "ps-ed");
    await expect(saveSiteText(t.db, viewer, { heroTitle: "Nope" })).rejects.toThrow(/Only editors/);
    await expect(saveSiteText(t.db, t.publicActor, { heroTitle: "Nope" })).rejects.toThrow(/Only editors/);
    await expect(siteForEditing(t.db, viewer)).rejects.toThrow(/Only editors/);
    await saveSiteText(t.db, editor, { heroTitle: "HCC Production", heroIntro: "We run sound.", guestsBody: "## Arrival" });
    expect((await siteText(t.db, t.publicActor)).heroIntro).toBe("We run sound.");
    await saveService(t.db, editor, { title: "Weddings", body: "Sound for ceremonies.", photoUrl: null });
    await expect(saveService(t.db, editor, { title: "X", photoUrl: "https://evil.example/x.png" })).rejects.toThrow(/Upload the photo/);
    expect((await publicServiceCards(t.db, t.publicActor)).at(-1)?.title).toBe("Weddings");
  });

  it("shows only public gear fields, grouped by room, and never serials, IPs, MACs, notes or backups", async () => {
    const editor = await t.actorFor("editor", "ps-gear");
    const rooms = await publicRoomList(t.db, t.publicActor);
    const worship = rooms.find((r) => r.name === "Worship Center")!;
    const mic = await createGear(t.db, editor, { name: "ULXD4Q receiver", category: "Audio", serial: SECRETS[0], ip: SECRETS[1], mac: SECRETS[2], assetTag: SECRETS[3], notes: SECRETS[4], firmware: SECRETS[5] });
    await t.db.update(gear).set({ configs: [{ id: "c1", url: "/files/x", name: SECRETS[6], size: 1, note: SECRETS[6], at: "2026-01-01", by: editor.userId! }] }).where(eq(gear.id, mic.id));
    const hidden = await createGear(t.db, editor, { name: "Spare console", category: "Audio" });

    await expect(setGearPublic(t.db, editor, mic.id, { show: true, name: "", roomId: worship.id })).rejects.toThrow(/public name/);
    await setGearPublic(t.db, editor, mic.id, { show: true, name: "Shure wireless handheld", qty: 6, note: "SM58 capsules", roomId: worship.id });
    await setGearPublic(t.db, editor, hidden.id, { show: false });

    const room = await publicRoom(t.db, t.publicActor, worship.id);
    expect(room.gear).toEqual([{ group: "audio", label: "Audio", items: [{ name: "Shure wireless handheld", qty: 6, note: "SM58 capsules" }] }]);
    const everything = JSON.stringify(await publicRoomList(t.db, t.publicActor));
    for (const s of SECRETS) expect(everything).not.toContain(s);
    expect(everything).not.toContain("ULXD4Q receiver"); // the internal name isn't shown either
    expect(everything).not.toContain("Spare console");
  });

  it("shows a room layout as a stage plot without its gear and cable links", async () => {
    const editor = await t.actorFor("editor", "ps-plot");
    const p = await createProject(t.db, editor, { name: "Plots" });
    const layout = await createLayout(t.db, editor, p.id, "Worship Center stage");
    await t.db
      .update(layouts)
      .set({ items: [{ id: "a", type: "mic", label: "DI 1", x: 10, y: 10, gearId: "gear-secret-id" }], runs: [{ id: "r", from: "a", to: "a", label: "NET-001", cableId: "cable-secret-id" }] })
      .where(eq(layouts.id, layout.id));
    const room = (await publicRoomList(t.db, t.publicActor)).find((r) => r.name === "Atrium")!;
    await saveRoom(t.db, editor, { name: "Atrium", notes: "- Power: 2 × 20A", layoutId: layout.id }, room.id);
    const shown = await publicRoom(t.db, t.publicActor, room.id);
    expect(shown.plot?.name).toBe("Worship Center stage");
    expect(shown.notes).toBe("- Power: 2 × 20A");
    expect(JSON.stringify(shown)).not.toMatch(/gear-secret-id|cable-secret-id/);
  });
});
