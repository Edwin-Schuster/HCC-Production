/** Gear inventory vocabulary shared by the server and the browser. */

export const GEAR_STATUSES = ["in_service", "spare", "out_for_repair", "retired"] as const;
export type GearStatus = (typeof GEAR_STATUSES)[number];
export const GEAR_STATUS_LABEL: Record<GearStatus, string> = { in_service: "In service", spare: "Spare", out_for_repair: "Out for repair", retired: "Retired" };

export const GEAR_CATEGORIES = ["Audio", "Video", "Lighting", "Network", "Streaming", "Computer", "Power", "Rigging", "Other"] as const;

/** Lines of a config file that contain the filter (case-insensitive), with their 1-based line numbers. */
export function filterLines(text: string, filter: string): { n: number; line: string }[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const q = filter.trim().toLowerCase();
  return lines.map((line, i) => ({ n: i + 1, line })).filter((l) => !q || l.line.toLowerCase().includes(q));
}
