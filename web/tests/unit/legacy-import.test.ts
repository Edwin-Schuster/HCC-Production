import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cables, gear, people, projects, purchaseOrders, tasks, users, workComments } from "@/db/schema";
import { importLegacy, type LegacySource } from "@/server/import/legacy";
import { checkPassword } from "@/server/auth/password";
import { getSopDocument, listSops } from "@/server/services/sops";
import { listGear } from "@/server/services/gear";
import { testDb } from "./helpers";
import "../../../legacy/public/shared.js";

type Seed = Record<string, Record<string, unknown>[]>;
const HCC = (globalThis as unknown as { HCC: { seed: (adminId: string) => Seed } }).HCC;

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  process.env.UPLOAD_DIR ??= "./.data/test-uploads";
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

// "secret" hashed by the original app's scrypt:salt:hash scheme.
async function legacyHash(pw: string) {
  const crypto = await import("node:crypto");
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt:${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}

async function source(): Promise<LegacySource> {
  const docs = HCC.seed("usr_admin");
  // One gear item has a config backup and a project has a photo, so files come across too.
  docs.gear[0].configs = [{ fileId: "f_cfg", name: "foh.show", size: 11, at: "2026-01-02T10:00:00Z", firmware: "2.01" }];
  docs.photos = [{ id: "pho_1", projectId: "proj_sanctuary", fileId: "f_png", caption: "Rail", location: "Balcony", mime: "image/png", takenAt: "2026-02-01T09:00:00Z", by: "usr_maria" }];
  docs.activity = [{ id: "act_1", target: "tasks:tsk_fiber", projectId: "proj_sanctuary", actorId: "usr_maria", text: "changed status to “In Progress”", name: "Pull fiber", at: "2026-02-02T09:00:00Z" }];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const blobs: Record<string, Uint8Array> = { f_cfg: new TextEncoder().encode("scene 1\nmix\n"), f_png: new Uint8Array(png) };
  return {
    users: [
      { id: "usr_admin", username: "edwin", name: "Edwin Schuster", email: "e@x.org", role: "admin", password_hash: await legacyHash("old-password-1"), ntfy_topic: "hcc-edwin-xyz", person_id: "per_edwin" },
      { id: "usr_maria", username: "maria", name: "Maria Lopez", email: "maria@example.org", role: "editor", password_hash: null, ntfy_topic: null, person_id: "per_maria" },
      { id: "usr_james", username: "james", name: "James Carter", email: "james@example.org", role: "editor", password_hash: null, ntfy_topic: null, person_id: "per_james" },
    ],
    docs: docs as LegacySource["docs"],
    files: new Map([
      ["f_cfg", { id: "f_cfg", name: "foh.show", mime: "application/octet-stream", size: 11 }],
      ["f_png", { id: "f_png", name: "rail.png", mime: "image/png", size: png.length }],
    ]),
    readFile: async (id) => blobs[id] ?? null,
  };
}

describe("legacy import", () => {
  it("brings every collection across and is safe to re-run", async () => {
    const src = await source();
    const first = await importLegacy(t.db, src);
    expect(first.warnings.filter((w) => !/Slack|webhook/.test(w))).toEqual([]);
    expect(first.counts).toMatchObject({ users: 3, people: 5, sops: src.docs.sops.length, projects: 2, tasks: 11, cables: 5, layouts: 1, bom: 6, purchases: 3, contractors: 2, sow: 2, access: 2, punch: 2, invoices: 1, gear: 5, photos: 1, files: 2, comments: 2, activity: 1 });

    // Passwords keep working and accounts link to the roster.
    const [edwin] = await t.db.select().from(users).where(eq(users.username, "edwin"));
    expect(checkPassword("old-password-1", edwin.passwordHash!)).toBe(true);
    expect(edwin.ntfyTopic).toBe("hcc-edwin-xyz");
    const [maria] = await t.db.select().from(users).where(eq(users.username, "maria"));
    expect((await t.db.select().from(people).where(eq(people.userId, maria.id)))[0]).toMatchObject({ name: "Maria Lopez", status: "serving" });

    // Statuses, money and structure map onto the new vocabulary.
    const [sanctuary] = await t.db.select().from(projects).where(eq(projects.name, "Sanctuary AV Refresh"));
    expect(sanctuary).toMatchObject({ status: "active", budgetCents: 8_500_000 });
    const all = await t.db.select().from(tasks).where(eq(tasks.projectId, sanctuary.id));
    const fiber = all.find((x) => x.title.startsWith("Pull fiber"))!;
    expect(fiber).toMatchObject({ status: "in_progress", priority: "high" });
    expect(all.filter((x) => x.parentId === fiber.id)).toHaveLength(2);
    expect((await t.db.select().from(workComments).where(eq(workComments.targetId, fiber.id))).length).toBe(2);
    expect((await t.db.select().from(cables)).map((c) => c.status)).toContain("tested");
    const [po] = await t.db.select().from(purchaseOrders).where(eq(purchaseOrders.poNumber, "PO-2026-035"));
    expect(po.status).toBe("partially_received");
    expect(po.lines[0]).toMatchObject({ qty: 250, unitCostCents: 240, receivedQty: 250 });
    const foh = (await listGear(t.db, { userId: edwin.id, name: "Edwin", username: "edwin", role: "admin", workspaceId: t.ws.id })).find((g) => g.name === "FOH Console")!;
    expect(foh).toMatchObject({ status: "in_service", firmware: "2.01" });
    expect(foh.configs[0]).toMatchObject({ name: "foh.show", firmware: "2.01" });
    expect((await t.db.select().from(gear)).length).toBe(5);

    // SOPs are published, with the old Markdown containers turned into steps and callouts.
    const admin = await t.actorFor("admin");
    const sops = await listSops(t.db, admin);
    const startup = sops.find((s) => s.title === "Sunday System Startup")!;
    const doc = await getSopDocument(t.db, admin, startup.id);
    expect(doc.version.isDraft).toBe(false);
    expect(doc.blocks.filter((b) => b.type === "step").length).toBeGreaterThan(3);
    expect(doc.blocks.some((b) => b.type === "callout")).toBe(true);

    const again = await importLegacy(t.db, src);
    expect(again.counts).toEqual({});
  });
});
