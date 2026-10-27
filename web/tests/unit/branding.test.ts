import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBranding, updateBranding } from "@/server/services/branding";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("branding", () => {
  it("is admin-only and validated", async () => {
    const admin = await t.actorFor("admin");
    const editor = await t.actorFor("editor", "brand-editor");
    await expect(updateBranding(t.db, editor, { primaryColor: "#112233" })).rejects.toThrow(/Only admins/);
    await expect(updateBranding(t.db, admin, { primaryColor: "red" })).rejects.toThrow();
    await expect(updateBranding(t.db, admin, { logoUrl: "javascript:alert(1)" })).rejects.toThrow();
    await updateBranding(t.db, admin, { primaryColor: "#112233", font: "serif", headerText: "HCC", logoUrl: "" });
    expect(await getBranding(t.db, admin.workspaceId)).toEqual({ primaryColor: "#112233", font: "serif", headerText: "HCC", footerText: "", logoUrl: null });
  });
});
