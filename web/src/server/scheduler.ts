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
}
