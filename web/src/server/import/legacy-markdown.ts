import { marked } from "marked";
import { callout, embed, image, step, video } from "@/blocks/build";
import type { BlockNode, CalloutVariant } from "@/blocks/schema";
import { htmlToBlocks } from "./html-to-blocks";

/**
 * The original app's SOP Markdown → blocks. Besides plain Markdown it had containers:
 *   :::steps          a run of "### Title" sections, each a numbered step
 *   :::note Title     callouts (note, tip, info, check, warning, danger)
 *   :::accordion Q    a collapsible answer (becomes an info callout)
 *   @[youtube](url)   an embedded video or page
 */

const VARIANT: Record<string, CalloutVariant> = { note: "info", tip: "info", info: "info", check: "info", warning: "warning", danger: "danger" };

const plainText = (md: string) =>
  md
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const imagesIn = (md: string) => [...md.matchAll(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)].map((m) => image(m[2], m[1]));

function markdown(md: string): BlockNode[] {
  if (!md.trim()) return [];
  return htmlToBlocks(marked.parse(md, { gfm: true, async: false }) as string).blocks;
}

function embedLine(kind: string, url: string): BlockNode {
  return /^(youtube|vimeo|video)$/i.test(kind) || /\.(mp4|webm)(\?|$)/i.test(url) ? video(url) : embed(url, kind);
}

export function legacyMarkdownToBlocks(source: string): BlockNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: BlockNode[] = [];
  let buf: string[] = [];
  const flush = () => {
    out.push(...markdown(buf.join("\n")));
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = line.match(/^:::\s*(\w+)\s*(.*)$/);
    const em = line.trim().match(/^@\[(\w+)\]\(([^)]+)\)$/);
    if (em) {
      flush();
      out.push(embedLine(em[1], em[2]));
      continue;
    }
    if (!open) {
      buf.push(line);
      continue;
    }
    flush();
    // Collect the container's body, allowing nested containers.
    const body: string[] = [];
    let depth = 1;
    for (i++; i < lines.length; i++) {
      if (/^:::\s*\w+/.test(lines[i])) depth++;
      else if (/^:::\s*$/.test(lines[i]) && --depth === 0) break;
      body.push(lines[i]);
    }
    const [, type, title] = open;
    const text = body.join("\n");
    if (type === "steps") {
      let cur: { title: string; lines: string[] } | null = null;
      const steps: { title: string; lines: string[] }[] = [];
      for (const l of body) {
        const h = l.match(/^###\s+(.*)/);
        if (h) steps.push((cur = { title: h[1].trim(), lines: [] }));
        else if (cur) cur.lines.push(l);
      }
      for (const s of steps) {
        const md = s.lines.join("\n");
        out.push(step(s.title, { description: plainText(md).slice(0, 10_000) }, imagesIn(md)));
      }
    } else if (type === "accordion") {
      out.push(callout("info", `**${(title || "Details").trim()}** ${plainText(text)}`.trim()));
    } else {
      const variant = VARIANT[type.toLowerCase()] ?? "info";
      out.push(callout(variant, `${title ? `**${title.trim()}** ` : ""}${plainText(text)}`.trim()));
      out.push(...imagesIn(text));
    }
  }
  flush();
  return out;
}
