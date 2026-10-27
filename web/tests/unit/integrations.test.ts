import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { apiKeys, webhookDeliveries } from "@/db/schema";
import { step } from "@/blocks/build";
import { urlMatches } from "@/lib/url-match";
import { actorForApiKey, createApiKey, revokeApiKey } from "@/server/services/apikeys";
import { createWebhook, deliverDue, sign } from "@/server/services/webhooks";
import { createSop, publishDraft, saveDraft } from "@/server/services/sops";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe("API keys", () => {
  it("act as their owner, capped at the key's role, and stop working when revoked or expired", async () => {
    const editor = await t.actorFor("editor", "key-editor");
    const viewer = await t.actorFor("viewer", "key-viewer");
    const read = await createApiKey(t.db, editor, { name: "read", role: "viewer" });
    const write = await createApiKey(t.db, editor, { name: "write", role: "editor" });
    expect((await actorForApiKey(t.db, read.token))?.role).toBe("viewer");
    expect((await actorForApiKey(t.db, write.token))).toMatchObject({ userId: editor.userId, role: "editor" });
    await expect(createApiKey(t.db, viewer, { name: "x", role: "editor" })).rejects.toThrow(/Only editors/);
    await revokeApiKey(t.db, editor, read.id);
    expect(await actorForApiKey(t.db, read.token)).toBeNull();
    await t.db.update(apiKeys).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(apiKeys.id, write.id));
    expect(await actorForApiKey(t.db, write.token)).toBeNull();
    expect(await actorForApiKey(t.db, "hcc_not-a-real-key-at-all-xxxxx")).toBeNull();
  });
});

describe("webhooks", () => {
  it("queue an event with the change, sign deliveries, and retry failures with backoff", async () => {
    const admin = await t.actorFor("admin");
    const { secret } = await createWebhook(t.db, admin, { url: "https://example.org/hook", events: ["sop.published"] });
    const sop = await createSop(t.db, admin, { title: "Hooked", folderId: t.general.id });
    await saveDraft(t.db, admin, sop.id, { title: "Hooked", blocks: [step("a")] });
    await publishDraft(t.db, admin, sop.id, { changeSummary: "First version" });

    const calls: { body: string; sig: string | null }[] = [];
    let fail = true;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      calls.push({ body: String(init.body), sig: new Headers(init.headers).get("X-HCC-Signature") });
      return new Response(null, { status: fail ? 500 : 200 });
    }) as typeof fetch;

    await deliverDue(t.db, new Date(), fakeFetch);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body)).toMatchObject({ event: "sop.published", data: { id: sop.id, versionNumber: 1 } });
    expect(calls[0].sig).toBe(sign(secret, calls[0].body));
    let [d] = await t.db.select().from(webhookDeliveries);
    expect(d).toMatchObject({ status: "pending", attempts: 1, lastStatusCode: 500 });

    await deliverDue(t.db, new Date(), fakeFetch); // not due yet
    expect(calls).toHaveLength(1);
    fail = false;
    await deliverDue(t.db, new Date(Date.now() + 2 * 60_000), fakeFetch);
    [d] = await t.db.select().from(webhookDeliveries);
    expect(d).toMatchObject({ status: "success", attempts: 2 });
  });

  it("are admin-only", async () => {
    const editor = await t.actorFor("editor", "hook-editor");
    await expect(createWebhook(t.db, editor, { url: "https://example.org", events: ["sop.created"] })).rejects.toThrow(/Only admins/);
  });
});

describe("urlMatches", () => {
  it("matches sites and paths with wildcards, ignoring scheme and www", () => {
    expect(urlMatches("studio.youtube.com/*", "https://studio.youtube.com/channel/x/livestreaming")).toBe(true);
    expect(urlMatches("studio.youtube.com", "https://studio.youtube.com/anything")).toBe(true);
    expect(urlMatches("*.planningcenteronline.com/*", "https://services.planningcenteronline.com/plans/1")).toBe(true);
    expect(urlMatches("youtube.com/watch*", "https://www.youtube.com/watch?v=1")).toBe(true);
    expect(urlMatches("studio.youtube.com/*", "https://evil.com/studio.youtube.com/")).toBe(false);
  });
});
