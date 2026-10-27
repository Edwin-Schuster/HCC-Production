import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditEvents, notifications, sops } from "@/db/schema";
import { step } from "@/blocks/build";
import { reviewState } from "@/lib/review";
import { createSop, publishDraft, saveDraft } from "@/server/services/sops";
import { markReviewed, sweepReviewReminders } from "@/server/services/reviews";
import { listNotifications, markRead, notify, unreadCount } from "@/server/services/notifications";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

const day = 864e5;

async function publishedSop(title: string, ownerId?: string) {
  const admin = await t.actorFor("admin");
  const sop = await createSop(t.db, admin, { title, folderId: t.general.id, reviewIntervalDays: 30, ownerId });
  await saveDraft(t.db, admin, sop.id, { title, blocks: [step("a")] });
  await publishDraft(t.db, admin, sop.id, { changeSummary: "First version" });
  return { admin, sop };
}

describe("review state", () => {
  it("is due within two weeks and overdue after the date", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(reviewState(null, now)).toBe("none");
    expect(reviewState(new Date(now.getTime() + 30 * day), now)).toBe("ok");
    expect(reviewState(new Date(now.getTime() + 5 * day), now)).toBe("due");
    expect(reviewState(new Date(now.getTime() - day), now)).toBe("overdue");
  });
});

describe("review reminders", () => {
  it("notify the owner once per due date, then weekly while overdue", async () => {
    const editor = await t.actorFor("editor", "owner-1");
    const { sop } = await publishedSop("Reminder test", editor.userId!);
    const due = new Date(Date.now() + 3 * day);
    await t.db.update(sops).set({ nextReviewAt: due }).where(eq(sops.id, sop.id));
    const mine = async () => (await t.db.select().from(notifications).where(eq(notifications.userId, editor.userId!))).filter((n) => n.kind.startsWith("review_"));

    await sweepReviewReminders(t.db, new Date());
    await sweepReviewReminders(t.db, new Date()); // repeated sweeps are no-ops
    expect((await mine()).map((n) => n.kind)).toEqual(["review_due"]);

    const late = new Date(due.getTime() + 2 * day);
    await sweepReviewReminders(t.db, late);
    await sweepReviewReminders(t.db, new Date(late.getTime() + day));
    await sweepReviewReminders(t.db, new Date(late.getTime() + 8 * day));
    expect((await mine()).map((n) => n.kind).sort()).toEqual(["review_due", "review_overdue", "review_overdue"]);
  });

  it("mark reviewed restarts the clock and is audited", async () => {
    const { admin, sop } = await publishedSop("Mark reviewed");
    await t.db.update(sops).set({ nextReviewAt: new Date(Date.now() - day) }).where(eq(sops.id, sop.id));
    const res = await markReviewed(t.db, admin, sop.id, { note: "Still right" });
    expect(new Date(res.nextReviewAt).getTime()).toBeGreaterThan(Date.now() + 29 * day);
    const [ev] = await t.db.select().from(auditEvents).where(and(eq(auditEvents.targetId, sop.id), eq(auditEvents.action, "sop.reviewed")));
    expect(ev.metadata).toMatchObject({ note: "Still right" });
    const viewer = await t.actorFor("viewer", "review-viewer");
    await expect(markReviewed(t.db, viewer, sop.id, {})).rejects.toThrow(/can't review/);
  });
});

describe("notifications", () => {
  it("skip the actor, dedupe, and only mark the reader's own as read", async () => {
    const a = await t.actorFor("editor", "notif-a");
    const b = await t.actorFor("editor", "notif-b");
    await notify(t.db, { workspaceId: a.workspaceId, userIds: [a.userId, b.userId], actorId: a.userId, kind: "comment", title: "Hi", link: "/sops", dedupeKey: "k1" });
    await notify(t.db, { workspaceId: a.workspaceId, userIds: [b.userId], actorId: a.userId, kind: "comment", title: "Hi again", link: "/sops", dedupeKey: "k1" });
    expect(await unreadCount(t.db, a)).toBe(0);
    expect(await unreadCount(t.db, b)).toBe(1);
    const [n] = await listNotifications(t.db, b);
    await markRead(t.db, a, [n.id]); // someone else's: ignored
    expect(await unreadCount(t.db, b)).toBe(1);
    await markRead(t.db, b, "all");
    expect(await unreadCount(t.db, b)).toBe(0);
  });
});
