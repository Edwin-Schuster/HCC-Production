/** Review cadence shared by the server (badges, reminders) and the UI. */
export const DUE_SOON_DAYS = 14;
export type ReviewState = "ok" | "due" | "overdue" | "none";

export function reviewState(nextReviewAt: Date | string | null | undefined, now: Date): ReviewState {
  if (!nextReviewAt) return "none";
  const due = new Date(nextReviewAt).getTime();
  if (due < now.getTime()) return "overdue";
  if (due - now.getTime() < DUE_SOON_DAYS * 864e5) return "due";
  return "ok";
}
