/** A Google Sheets link, reduced to what's needed to open or embed it. */
export type SheetRef = { id: string; gid: string | null };

/** Reads a Google Sheets link (edit, view or share link). Returns null for anything else. */
export function parseSheetUrl(input: string): SheetRef | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
  const m = url.pathname.match(/^\/spreadsheets\/(?:u\/\d+\/)?d\/([\w-]{20,100})(?:\/|$)/);
  if (!m) return null;
  const gid = url.hash.match(/gid=(\d+)/)?.[1] ?? url.searchParams.get("gid");
  return { id: m[1], gid: gid && /^\d+$/.test(gid) ? gid : null };
}

/** The normal editor link, opening on the same tab of the sheet. */
export const sheetEditUrl = ({ id, gid }: SheetRef) => `https://docs.google.com/spreadsheets/d/${id}/edit${gid ? `#gid=${gid}` : ""}`;
