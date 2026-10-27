/** Contractor vocabulary shared by the server and the browser. */

export const PUNCH_STATUSES = ["open", "in_progress", "ready_for_review", "closed"] as const;
export type PunchStatus = (typeof PUNCH_STATUSES)[number];
export const PUNCH_STATUS_LABEL: Record<PunchStatus, string> = { open: "Open", in_progress: "In progress", ready_for_review: "Ready for review", closed: "Closed" };
