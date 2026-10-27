import type { DB } from "@/db";

/**
 * Background jobs for a single-container deployment: an in-process timer, started once per server.
 * Each job must be idempotent, because a restart can run it again at any time.
 */
const g = globalThis as unknown as { __hccScheduler?: boolean };

export function startScheduler(db: DB) {
  if (g.__hccScheduler || process.env.DISABLE_SCHEDULER === "true") return;
  g.__hccScheduler = true;
  const hourly = async () => {
    try {
      const { sweepReviewReminders } = await import("@/server/services/reviews");
      await sweepReviewReminders(db);
    } catch (e) {
      console.error("Scheduled review reminders failed:", e);
    }
  };
  setTimeout(hourly, 30_000).unref();
  setInterval(hourly, 60 * 60_000).unref();

  // Task due-date reminders: every 15 minutes, so a short reminder window still lands on time.
  const taskReminders = async () => {
    try {
      const { sweepTaskReminders } = await import("@/server/services/tasks");
      await sweepTaskReminders(db);
    } catch (e) {
      console.error("Scheduled task reminders failed:", e);
    }
  };
  setTimeout(taskReminders, 45_000).unref();
  setInterval(taskReminders, 15 * 60_000).unref();

  // Webhook deliveries: every 20 seconds, so receivers hear about changes quickly.
  let sending = false;
  setInterval(async () => {
    if (sending) return;
    sending = true;
    try {
      const { deliverDue } = await import("@/server/services/webhooks");
      await deliverDue(db);
    } catch (e) {
      console.error("Webhook delivery failed:", e);
    } finally {
      sending = false;
    }
  }, 20_000).unref();
}
