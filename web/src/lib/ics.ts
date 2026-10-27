/** iCalendar (RFC 5545) feed of all-day events. */

export type CalendarEvent = { uid: string; start: string; end: string; summary: string; description?: string; url?: string };

const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");
const ymd = (d: string) => d.replaceAll("-", "");
const nextDay = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

/** Lines longer than 75 octets are folded with CRLF + space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(name: string, events: CalendarEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HCC Production//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@hcc-production`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(e.start)}`, `DTEND;VALUE=DATE:${ymd(nextDay(e.end < e.start ? e.start : e.end))}`, `SUMMARY:${esc(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
