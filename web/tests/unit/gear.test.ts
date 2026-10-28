import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { filterLines } from "@/lib/gear";
import { uploadAttachment } from "@/server/services/files";
import { addConfigBackup, createGear, getGear, listGear, logFirmware, readConfigBackup, removeConfigBackup, updateGear } from "@/server/services/gear";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  process.env.UPLOAD_DIR ??= "./.data/test-uploads";
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("gear", () => {
  it("filters config lines with their numbers", () => {
    expect(filterLines("hostname foh\r\nvlan 10\ninterface eth0\n  vlan 20", "VLAN")).toEqual([
      { n: 2, line: "vlan 10" },
      { n: 4, line: "  vlan 20" },
    ]);
    expect(filterLines("a\nb", "")).toHaveLength(2);
  });

  it("validates addresses and keeps a firmware history", async () => {
    const editor = await t.actorFor("editor", "gr-ed");
    const viewer = await t.actorFor("viewer", "gr-vw");
    await expect(listGear(t.db, viewer)).rejects.toThrow(/Only editors/);
    await expect(createGear(t.db, editor, { name: "Bad", mac: "zz:zz" })).rejects.toThrow(/MAC/);
    const g = await createGear(t.db, editor, { name: "FOH Console", category: "Audio", model: "dLive S5000", ip: "192.168.10.10", mac: "00:04:C4:12:34:56", firmware: "1.9" });
    await logFirmware(t.db, editor, g.id, { version: "2.01", note: "Fixes DSP glitch", date: "2026-03-01" });
    await expect(logFirmware(t.db, editor, g.id, { version: "2.01" })).rejects.toThrow(/already on 2.01/);
    const item = await getGear(t.db, editor, g.id);
    expect(item).toMatchObject({ firmware: "2.01", firmwareUpdated: "2026-03-01" });
    expect(item.firmwareHistory[0]).toMatchObject({ from: "1.9", to: "2.01", note: "Fixes DSP glitch", byName: "gr-ed" });
    await updateGear(t.db, editor, g.id, { name: "FOH Console", status: "out_for_repair" });
    expect((await getGear(t.db, editor, g.id)).status).toBe("out_for_repair");
  });

  it("stores config backups and shows them as text", async () => {
    const editor = await t.actorFor("editor", "cfg-ed");
    const g = await createGear(t.db, editor, { name: "Core switch", firmware: "15.2" });
    const file = await uploadAttachment(t.db, editor, "switch.cfg", new TextEncoder().encode("hostname core\nvlan 10\n"));
    const backup = await addConfigBackup(t.db, editor, g.id, { file, note: "Before update" });
    expect(backup.firmware).toBe("15.2");
    expect((await readConfigBackup(t.db, editor, g.id, backup.id)).text).toContain("vlan 10");
    await removeConfigBackup(t.db, editor, g.id, backup.id);
    expect((await getGear(t.db, editor, g.id)).configs).toEqual([]);
  });
});
