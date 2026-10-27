import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshness } from "@/lib/roster";
import { checkIn, createPerson, createRole, deleteRole, listRoster, updatePerson } from "@/server/services/roster";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("roster", () => {
  it("rates check-ins as fresh, recent or stale", () => {
    const now = Date.parse("2026-06-10T12:00:00Z");
    expect(freshness("2026-06-09T12:00:00Z", now)).toBe("fresh");
    expect(freshness("2026-06-05T12:00:00Z", now)).toBe("recent");
    expect(freshness("2026-05-30T12:00:00Z", now)).toBe("stale");
    expect(freshness(null, now)).toBe("stale");
  });

  it("lets members read, editors write, and the public neither", async () => {
    const editor = await t.actorFor("editor", "ro-ed");
    const viewer = await t.actorFor("viewer", "ro-vw");
    await expect(createPerson(t.db, viewer, { name: "Nope" })).rejects.toThrow(/Only editors/);
    await createPerson(t.db, editor, { name: "Alex Rivera", email: "alex@example.org" });
    expect((await listRoster(t.db, viewer)).people.map((p) => p.name)).toContain("Alex Rivera");
    await expect(listRoster(t.db, t.publicActor)).rejects.toThrow(/Sign in/);
  });

  it("checks in your own linked entry; only editors update someone else", async () => {
    const editor = await t.actorFor("editor", "ci-ed");
    const viewer = await t.actorFor("viewer", "ci-vw");
    const other = await t.actorFor("viewer", "ci-other");
    await expect(checkIn(t.db, viewer, { status: "on_site" })).rejects.toThrow(/isn't linked/);
    const mine = await createPerson(t.db, editor, { name: "Viewer Person", userId: viewer.userId });
    const theirs = await createPerson(t.db, editor, { name: "Other Person", userId: other.userId });
    await expect(createPerson(t.db, editor, { name: "Dup", userId: viewer.userId })).rejects.toThrow(/already linked to Viewer Person/);

    const after = await checkIn(t.db, viewer, { status: "on_site", note: "Booth" });
    expect(after).toMatchObject({ id: mine.id, status: "on_site", statusNote: "Booth" });
    expect(after.lastCheckIn).not.toBeNull();
    expect((await listRoster(t.db, viewer)).me?.id).toBe(mine.id);

    await expect(checkIn(t.db, viewer, { status: "away", personId: theirs.id })).rejects.toThrow(/only check yourself/);
    expect(await checkIn(t.db, editor, { status: "away", personId: theirs.id })).toMatchObject({ status: "away" });
  });

  it("validates roles and removes a deleted role from everyone", async () => {
    const editor = await t.actorFor("editor", "rl-ed");
    const role = await createRole(t.db, editor, { name: "Floor Manager", color: "#336699" });
    await expect(createPerson(t.db, editor, { name: "Bad", roleIds: ["nope"] })).rejects.toThrow(/no longer exists/);
    const p = await createPerson(t.db, editor, { name: "Pat", roleIds: [role.id, role.id] });
    expect(p.roleIds).toEqual([role.id]);
    await deleteRole(t.db, editor, role.id);
    const after = (await listRoster(t.db, editor)).people.find((x) => x.id === p.id)!;
    expect(after.roleIds).toEqual([]);
    await expect(updatePerson(t.db, editor, p.id, { name: "Pat", roleIds: [role.id] })).rejects.toThrow(/no longer exists/);
  });
});
