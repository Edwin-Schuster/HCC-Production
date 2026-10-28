import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { notify } from "@/server/services/notifications";
import { sendPush, setNtfyTopic, testPush } from "@/server/services/push";
import { updateSettings } from "@/server/services/settings";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("phone push", () => {
  it("validates topics and pushes inbox notifications to people with one", async () => {
    const admin = await t.actorFor("admin");
    const a = await t.actorFor("editor", "push-a");
    const b = await t.actorFor("editor", "push-b");
    await expect(setNtfyTopic(t.db, a, { topic: "bad topic!" })).rejects.toThrow(/letters, numbers/);
    await setNtfyTopic(t.db, a, { topic: "hcc-push-a-123" });
    await updateSettings(t.db, admin, { reminderHours: 24, appUrl: "https://hcc.example.org/", ntfyServer: "https://ntfy.example.org" });

    vi.stubEnv("NODE_ENV", "production");
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await sendPush(t.db, a.workspaceId, [a.userId!, b.userId!], { title: "Due soon: Order cable", link: "/inbox" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ntfy.example.org");
    expect(JSON.parse(String(init.body))).toMatchObject({ topic: "hcc-push-a-123", title: "Due soon: Order cable", click: "https://hcc.example.org/inbox" });

    fetch.mockClear();
    await notify(t.db, { workspaceId: a.workspaceId, userIds: [a.userId], actorId: b.userId, kind: "mention", title: "b mentioned you", link: "/x" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    fetch.mockImplementation(async () => new Response("nope", { status: 500 }));
    await expect(sendPush(t.db, a.workspaceId, [a.userId!], { title: "x" })).resolves.toBeUndefined();
    await expect(testPush(t.db, a)).rejects.toThrow(/Couldn't reach https:\/\/ntfy.example.org/);
  });
});
