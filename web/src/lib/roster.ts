/** Roster vocabulary shared by the server and the browser. */

export const PERSON_STATUSES = ["available", "on_site", "serving", "away", "unavailable"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const PERSON_STATUS_LABEL: Record<PersonStatus, string> = {
  available: "Available",
  on_site: "On site",
  serving: "Serving Sunday",
  away: "Away",
  unavailable: "Unavailable",
};

export const PERSON_STATUS_TONE: Record<PersonStatus, "good" | "info" | "warn" | "bad"> = {
  available: "good",
  on_site: "info",
  serving: "info",
  away: "warn",
  unavailable: "bad",
};

export type Freshness = "fresh" | "recent" | "stale";

/** How current someone's check-in is: under 2 days is fresh, under 8 recent, older (or never) stale. */
export function freshness(iso: string | null | undefined, now = Date.now()): Freshness {
  if (!iso) return "stale";
  const days = (now - new Date(iso).getTime()) / 864e5;
  return days < 2 ? "fresh" : days < 8 ? "recent" : "stale";
}
