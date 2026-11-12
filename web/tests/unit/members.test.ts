import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sops, users } from "@/db/schema";
import { createSop } from "@/server/services/sops";
import { listMembers, removeMember, upsertMember } from "@/server/services/workspace";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("people", () => {
  it("lets an admin change their own username and name", async () => {
    const admin = await t.actorFor("admin", "self-admin");
    await upsertMember(t.db, admin, { username: "edwin", name: "Edwin Schuster", email: "", role: "admin" }, admin.userId!);
    const [u] = await t.db.select().from(users).where(eq(users.id, admin.userId!));
    expect(u).toMatchObject({ username: "edwin", name: "Edwin Schuster" });
  });

  it("removes a person: no sign-in, off the list, username free again, their SOPs pass to the admin", async () => {
    const admin = await t.actorFor("admin", "rm-admin");
    const editor = await t.actorFor("editor", "rm-editor");
    const sop = await createSop(t.db, editor, { title: "Owned by the editor", folderId: t.general.id });
    const [before] = await t.db.select({ username: users.username }).from(users).where(eq(users.id, editor.userId!));

    await expect(removeMember(t.db, editor, admin.userId!)).rejects.toThrow(/Only admins/);
    await expect(removeMember(t.db, admin, admin.userId!)).rejects.toThrow(/can't remove yourself/);
    expect(await removeMember(t.db, admin, editor.userId!)).toEqual({ name: expect.any(String), sopsReassigned: 1 });

    expect((await listMembers(t.db, admin)).map((m) => m.id)).not.toContain(editor.userId);
    const [u] = await t.db.select().from(users).where(eq(users.id, editor.userId!));
    expect(u).toMatchObject({ disabled: true, passwordHash: null });
    const [s] = await t.db.select({ ownerId: sops.ownerId }).from(sops).where(eq(sops.id, sop.id));
    expect(s.ownerId).toBe(admin.userId);
    // The old username can be given to someone new.
    await upsertMember(t.db, admin, { username: before.username, name: "New person", email: "", role: "viewer", password: "password-123" });
  });

  it("won't remove the last admin", async () => {
    const last = await t.actorFor("admin", "last-admin");
    for (const m of await listMembers(t.db, last)) if (m.role === "admin" && m.id !== last.userId) await removeMember(t.db, last, m.id);
    // Another admin session (e.g. an API key's actor) trying to remove the only remaining admin.
    const other = { ...last, userId: "someone-else" };
    await expect(removeMember(t.db, other, last.userId!)).rejects.toThrow(/only admin/);
  });
});
