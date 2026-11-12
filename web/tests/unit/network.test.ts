import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyProjectNetwork, importPorts, listPorts, projectsWithNetwork, savePort } from "@/server/services/network";
import { createProject } from "@/server/services/projects";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

const port = (switchName: string, port: string, device = "", ip = "") => ({ switchName, port, vlan: "Production Network", ip, device, mac: "", length: "", notes: "" });

describe("the church's network", () => {
  it("is separate from project plans, editor-only, and can copy a project's plan in", async () => {
    const editor = await t.actorFor("editor", "net-ed");
    const viewer = await t.actorFor("viewer", "net-vw");
    await expect(listPorts(t.db, viewer, null)).rejects.toThrow(/Only editors/);

    const p = await createProject(t.db, editor, { name: "Worship Center" });
    await importPorts(t.db, editor, p.id, [port("Switch 1", "Port 1", "GFX 1", "10.0.19.15"), port("Switch 1", "Port 2", "Hyperdeck")]);
    await savePort(t.db, editor, null, port("Booth switch", "Port 1", "Lighting PC"));

    expect((await listPorts(t.db, editor, null)).map((r) => r.device)).toEqual(["Lighting PC"]);
    expect((await listPorts(t.db, editor, p.id)).map((r) => r.device)).toEqual(["GFX 1", "Hyperdeck"]);
    expect(await projectsWithNetwork(t.db, editor)).toEqual([{ id: p.id, name: "Worship Center", ports: 2 }]);

    expect(await copyProjectNetwork(t.db, editor, p.id)).toEqual({ created: 2, updated: 0, unchanged: 0 });
    expect(await copyProjectNetwork(t.db, editor, p.id)).toMatchObject({ created: 0 }); // matched, not duplicated
    expect((await listPorts(t.db, editor, null)).map((r) => `${r.switchName} ${r.port} ${r.device}`)).toEqual(["Switch 1 Port 1 GFX 1", "Switch 1 Port 2 Hyperdeck", "Booth switch Port 1 Lighting PC"]);
    expect(await listPorts(t.db, editor, p.id)).toHaveLength(2); // the project's plan is unchanged
  });
});
