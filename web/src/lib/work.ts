/** Vocabulary for projects and tasks, shared by the server and the browser. */

export const PROJECT_STATUSES = ["planning", "active", "on_hold", "complete"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { planning: "Planning", active: "Active", on_hold: "On hold", complete: "Complete" };

export const TASK_STATUSES = ["backlog", "todo", "in_progress", "blocked", "review", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { backlog: "Backlog", todo: "To do", in_progress: "In progress", blocked: "Blocked", review: "Review", done: "Done" };

export const PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" };
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Today's date (YYYY-MM-DD) in the app's time zone. */
export function today(now = Date.now(), timeZone = process.env.NEXT_PUBLIC_APP_TIMEZONE || undefined): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
}

export const isOverdue = (t: { due: string | null; status: string }, todayStr: string) => Boolean(t.due && t.status !== "done" && t.due < todayStr);

/** A stable colour for a free-text label. */
export function labelHue(label: string): number {
  let h = 0;
  for (const c of label.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
