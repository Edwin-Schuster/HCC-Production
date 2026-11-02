/**
 * SOP Markdown: plain Markdown plus a few conventions so an SOP keeps its structure when imported.
 *
 *   ---                         Optional header: title, summary, tags (comma separated), folder.
 *   title: Sunday Startup
 *   ---
 *   1. Step title               Numbered lists are steps; indented numbered lists are sub-steps.
 *      - role: Audio            Step details, indented under the step (the dash is optional):
 *      - time: 5 min              role, time, expected, warning, and "if: <condition> -> <step number>".
 *      - expected: Green light
 *
 *      Description paragraph.   Indented paragraphs are the step's description.
 *      ![Caption](images/a.png "width=480")   Images keep their caption and width.
 *
 *   > [!WARNING]                Callouts: [!NOTE], [!TIP], [!WARNING], [!CAUTION], [!DANGER],
 *   > Text                      or a paragraph starting "Warning:", "Danger:" or "Note:".
 *
 * Step details are swapped for tokens before Markdown parsing (so Markdown can't mangle them) and read back
 * by htmlToBlocks. Tokens use only hex digits, so no Markdown syntax can appear inside them.
 */

export type SopMeta = { title?: string; summary?: string; tags?: string[]; folder?: string };
export type StepField = "role" | "time" | "expected" | "warning" | "if";

const FIELD: Record<string, StepField> = {
  role: "role",
  time: "time",
  duration: "time",
  minutes: "time",
  expected: "expected",
  "expected result": "expected",
  result: "expected",
  warning: "warning",
  caution: "warning",
  if: "if",
};

const hex = (s: string) => Buffer.from(s, "utf8").toString("hex");
const unhex = (s: string) => Buffer.from(s, "hex").toString("utf8");

export const FIELD_TOKEN = /⟦f:(role|time|expected|warning|if):([0-9a-f]*)⟧/g;
export const decodeField = (value: string) => unhex(value);

/** Splits off the header and swaps indented step-detail lines for tokens. */
export function prepareSopMarkdown(source: string): { markdown: string; meta: SopMeta } {
  let text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const meta: SopMeta = {};
  const head = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (head) {
    text = text.slice(head[0].length);
    for (const line of head[1].split("\n")) {
      const m = line.match(/^\s*([a-z ]+?)\s*:\s*(.*?)\s*$/i);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      const key = m[1].toLowerCase();
      if (key === "title") meta.title = value.slice(0, 200);
      else if (key === "summary" || key === "description") meta.summary = value.slice(0, 1_000);
      else if (key === "tags") meta.tags = value.replace(/^\[|\]$/g, "").split(",").map((t) => t.trim().replace(/^["']|["']$/g, "")).filter(Boolean).slice(0, 20);
      else if (key === "folder") meta.folder = value.slice(0, 120);
    }
  }

  let fence = false;
  const lines = text.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) return line;
    // Indented under a list item; a leading dash or bullet is optional.
    const m = line.match(/^(\s{2,})(?:[-*+]\s+)?([a-z][a-z ]*?)\s*:\s*(.+?)\s*$/i);
    const field = m && FIELD[m[2].toLowerCase()];
    return field ? `${m[1]}⟦f:${field}:${hex(m[3])}⟧` : line;
  });
  return { markdown: lines.join("\n"), meta };
}

/** "5", "5 min", "1h 30m", "1:30", "90 seconds" → whole minutes (rounded up), or null. */
export function parseMinutes(input: string): number | null {
  const s = input.trim().toLowerCase();
  const clock = s.match(/^(\d+):(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  let total = 0;
  let found = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)?\b/g)) {
    found = true;
    const n = Number(m[1]);
    const unit = m[2] ?? "m";
    total += unit.startsWith("h") ? n * 60 : unit.startsWith("s") ? n / 60 : n;
  }
  return found && total > 0 ? Math.min(100_000, Math.ceil(total)) : null;
}

/** "The console won't boot -> 5" (also →, =>, "go to step 5") → condition and step number. */
export function parseBranch(input: string): { condition: string; step: string } | null {
  const m = input.match(/^(.*?)\s*(?:→|->|=>|,?\s*go to)\s*(?:step\s*)?(\d+(?:\.\d+)*)\.?\s*$/i);
  if (!m || !m[1].trim()) return null;
  return { condition: m[1].trim().replace(/^if\s+/i, "").slice(0, 300), step: m[2] };
}
