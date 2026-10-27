import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openFile, servesInline, sniffAttachment, uploadAttachment } from "@/server/services/files";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  process.env.UPLOAD_DIR ??= "./.data/test-uploads";
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("project attachments", () => {
  it("never serves uploaded HTML or unknown files inline", () => {
    expect(sniffAttachment(new TextEncoder().encode("<script>alert(1)</script>"))).toBe("text/plain");
    expect(sniffAttachment(new Uint8Array([0, 1, 2, 3]))).toBe("application/octet-stream");
    expect(sniffAttachment(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(servesInline("application/octet-stream")).toBe(false);
    expect(servesInline("text/html")).toBe(false);
  });

  it("are private to editors in the workspace", async () => {
    const editor = await t.actorFor("editor", "file-ed");
    const viewer = await t.actorFor("viewer", "file-vw");
    await expect(uploadAttachment(t.db, viewer, "x.txt", new Uint8Array([65]))).rejects.toThrow(/Only editors/);
    const f = await uploadAttachment(t.db, editor, "contract.pdf", new TextEncoder().encode("%PDF-1.7 test"));
    expect(f.mime).toBe("application/pdf");
    await expect(openFile(t.db, f.id)).rejects.toThrow();
    await expect(openFile(t.db, f.id, undefined, async () => viewer)).rejects.toThrow();
    await expect(openFile(t.db, f.id, undefined, async () => t.publicActor)).rejects.toThrow();
    const ok = await openFile(t.db, f.id, undefined, async () => editor);
    expect(ok.private).toBe(true);
    await ok.stream.cancel();
  });
});
