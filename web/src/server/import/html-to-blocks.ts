import { parse, type HTMLElement, type Node } from "node-html-parser";
import type { BlockNode, CalloutVariant, InlineRun, RichText } from "@/blocks/schema";
import { decodeField, FIELD_TOKEN, parseBranch, parseMinutes, type StepField } from "./sop-markdown";

/**
 * HTML (from Word via mammoth, Google Docs' HTML export, or Markdown) → SOP blocks.
 * Headings become headings, numbered lists become steps (nested lists become sub-steps),
 * "Warning:"-style paragraphs become callouts, tables, code and images are kept.
 */

export type ImportResult = { title: string | null; blocks: BlockNode[]; warnings: string[] };

let seq = 0;
const nid = () => `imp-${Date.now().toString(36)}-${(++seq).toString(36)}`;
const node = (type: BlockNode["type"], content: unknown, children: BlockNode[] = []): BlockNode => {
  const id = nid();
  return { id, key: id, type, content, children } as BlockNode;
};

const ELEMENT = 1;
const TEXT = 3;
const isEl = (n: Node): n is HTMLElement => n.nodeType === ELEMENT;
const tag = (n: Node) => (isEl(n) ? n.tagName?.toLowerCase() ?? "" : "");

const SAFE_HREF = /^(https?:|mailto:|tel:)/i;

/** Inline content of an element as rich text runs (bold, italic, underline, strike, code, links). */
function inline(el: Node, marks: Omit<InlineRun, "text"> = {}): InlineRun[] {
  if (el.nodeType === TEXT) {
    const text = el.text.replace(/\s+/g, " ");
    return text ? [{ text, ...marks }] : [];
  }
  if (!isEl(el)) return [];
  const t = tag(el);
  if (t === "br") return [{ text: "\n", ...marks }];
  if (["ol", "ul", "table", "img", "pre"].includes(t)) return []; // handled as blocks
  const m = { ...marks };
  const style = el.getAttribute("style") ?? "";
  if (t === "strong" || t === "b" || /font-weight:\s*(bold|[6-9]00)/.test(style)) m.bold = true;
  if (t === "em" || t === "i" || /font-style:\s*italic/.test(style)) m.italic = true;
  if (t === "u" || /text-decoration:[^;]*underline/.test(style)) m.underline = true;
  if (t === "s" || t === "del" || t === "strike" || /line-through/.test(style)) m.strike = true;
  if (t === "code") m.code = true;
  if (t === "a") {
    let href = el.getAttribute("href") ?? "";
    // Google Docs wraps links in a redirect: https://www.google.com/url?q=<real>&...
    const g = href.match(/^https:\/\/www\.google\.com\/url\?q=([^&]+)/);
    if (g) href = decodeURIComponent(g[1]);
    if (SAFE_HREF.test(href)) m.href = href.slice(0, 2000);
  }
  return el.childNodes.flatMap((c) => inline(c, m));
}

/** Tidies whitespace and merges neighbouring runs with the same formatting. */
function tidy(runs: InlineRun[]): RichText {
  const out: InlineRun[] = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    const { text: _a, ...fa } = r;
    if (prev) {
      const { text: _b, ...fb } = prev;
      if (JSON.stringify(fa) === JSON.stringify(fb)) {
        prev.text += r.text;
        continue;
      }
    }
    out.push({ ...r });
  }
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, "");
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, "");
  }
  return out.filter((r) => r.text.length).map((r) => ({ ...r, text: r.text.slice(0, 20_000) }));
}

const plain = (rt: RichText) => rt.map((r) => r.text).join("");

const CALLOUT: [RegExp, CalloutVariant][] = [
  [/^(danger|stop)\s*[:!-]\s*/i, "danger"],
  [/^(warning|caution|important)\s*[:!-]\s*/i, "warning"],
  [/^(note|tip|info)\s*[:!-]\s*/i, "info"],
];

/** "Warning: Don't…" → a warning callout (prefix removed). */
function paragraph(input: RichText): BlockNode | null {
  const rt = takeFields(input).text; // step details outside a step have nothing to attach to
  const text = plain(rt);
  if (!text.trim()) return null;
  for (const [re, variant] of CALLOUT) {
    const m = text.match(re);
    if (m) {
      const drop = m[0].length;
      const rest = [...rt];
      let left = drop;
      while (left > 0 && rest.length) {
        if (rest[0].text.length <= left) left -= rest.shift()!.text.length;
        else {
          rest[0] = { ...rest[0], text: rest[0].text.slice(left) };
          left = 0;
        }
      }
      return node("callout", { variant, text: rest });
    }
  }
  return node("text", { text: rt });
}

/** Removes SOP Markdown step-detail tokens from text, returning what they said. */
function takeFields(rt: RichText): { text: RichText; fields: [StepField, string][] } {
  const fields: [StepField, string][] = [];
  const text = rt.map((r) => ({ ...r, text: r.text.replace(FIELD_TOKEN, (_m, k: StepField, v: string) => (fields.push([k, decodeField(v)]), " ")) }));
  return { text: fields.length ? tidy(text) : rt, fields };
}

/** Step descriptions keep **bold** and `code`; other formatting becomes plain text. */
const descriptionOf = (rt: RichText) => rt.map((r) => (r.code ? `\`${r.text}\`` : r.bold && r.text.trim() ? `**${r.text}**` : r.text)).join("");

const GH_ALERT: Record<string, CalloutVariant> = { NOTE: "info", TIP: "info", IMPORTANT: "warning", WARNING: "warning", CAUTION: "warning", DANGER: "danger" };

/** A quote block: GitHub-style "[!WARNING]" alerts and "Warning:" prefixes pick the callout type. */
function quoteBlock(el: HTMLElement): BlockNode | null {
  const text = tidy(inline(el));
  const raw = plain(text);
  if (!raw) return null;
  const alert = raw.match(/^\[!(\w+)\]\s*/);
  if (alert) {
    const variant = GH_ALERT[alert[1].toUpperCase()] ?? "info";
    const rest = paragraph(dropChars(text, alert[0].length));
    return node("callout", { variant, text: rest?.type === "callout" ? rest.content.text : dropChars(text, alert[0].length) });
  }
  const b = paragraph(text);
  return b?.type === "callout" ? b : node("callout", { variant: "info", text });
}

/** Drops the first n characters of rich text. */
function dropChars(rt: RichText, n: number): RichText {
  const rest = [...rt];
  let left = n;
  while (left > 0 && rest.length) {
    if (rest[0].text.length <= left) left -= rest.shift()!.text.length;
    else {
      rest[0] = { ...rest[0], text: rest[0].text.slice(left) };
      left = 0;
    }
  }
  return tidy(rest);
}

/** Google Docs' HTML export encodes list nesting as classes like "lst-kix_abc-2" rather than nested lists. */
const gdocsLevel = (el: HTMLElement) => Number((el.getAttribute("class") ?? "").match(/lst-kix_[\w]+-(\d+)/)?.[1] ?? NaN);

/** restartLists: a numbered list that starts at 1 again (Markdown "1.") starts the step numbering again. */
export function htmlToBlocks(html: string, opts: { restartLists?: boolean } = {}): ImportResult {
  const root = parse(html, { comment: false, blockTextElements: { script: false, style: false, pre: true } });
  const body = root.querySelector("body") ?? root;
  const warnings = new Set<string>();
  let title: string | null = root.querySelector("title")?.text.trim() || null;
  let sawTitleHeading = false;

  const listItems = (list: HTMLElement, ordered: boolean): BlockNode[] => {
    const out: BlockNode[] = [];
    for (const li of list.childNodes.filter((c) => tag(c) === "li") as HTMLElement[]) {
      const nested: BlockNode[] = [];
      const extra: string[] = [];
      let first: RichText | null = null;
      let checked: boolean | null = null;
      const checkbox = li.querySelector('input[type="checkbox"]');
      if (checkbox) checked = checkbox.hasAttribute("checked");
      const fields: [StepField, string][] = [];
      const media: BlockNode[] = [];
      const take = (rt: RichText) => {
        const r = takeFields(rt);
        fields.push(...r.fields);
        return r.text;
      };
      for (const c of li.childNodes) {
        const t = tag(c);
        if (isEl(c) && t !== "ol" && t !== "ul") for (const img of t === "img" ? [c] : c.querySelectorAll("img")) media.push(imageBlock(img, warnings));
        if (t === "ol" || t === "ul") nested.push(...listItems(c as HTMLElement, t === "ol"));
        else if (t === "blockquote") {
          const b = quoteBlock(c as HTMLElement);
          if (b) media.push(b);
        } else if (t === "pre") media.push(codeBlock(c as HTMLElement));
        else if (t === "table") media.push(tableBlock(c as HTMLElement));
        else if (t === "img") continue;
        else if (t === "p" && first !== null) {
          const rt = take(tidy(inline(c)));
          if (rt.length) extra.push(descriptionOf(rt));
        } else if (t === "p" || c.nodeType === TEXT || (isEl(c) && !["ol", "ul", "input"].includes(t))) {
          const rt = take(tidy(inline(c)));
          if (rt.length) first = first ? tidy([...first, { text: " " }, ...rt]) : rt;
        }
      }
      nested.unshift(...media.filter((b) => !(b.type === "image" && !b.content.url)));
      let text = first ?? [];
      // Markdown "[ ] task" written without a renderer's checkbox.
      const box = plain(text).match(/^\[( |x)\]\s*/i);
      if (box && checked === null) {
        checked = box[1].toLowerCase() === "x";
        text = tidy([{ ...text[0], text: text[0].text.slice(box[0].length) }, ...text.slice(1)]);
      }
      if (checked !== null) out.push(node("checklist", { text, checked }, nested));
      else if (ordered || fields.length) {
        const field = (k: StepField) => fields.filter(([f]) => f === k).map(([, v]) => v);
        const branches = field("if").map(parseBranch).filter((b) => b !== null).slice(0, 10).map((b) => ({ condition: b.condition, target: `#${b.step}` }));
        const minutes = field("time").map(parseMinutes).find((m) => m !== null) ?? null;
        const role = field("role")[0];
        out.push(
          node(
            "step",
            {
              title: text,
              description: extra.join("\n\n").slice(0, 10_000),
              // Role names are matched to the workspace's roles when the import is previewed.
              roleId: role ? `name:${role.slice(0, 58)}` : null,
              estDuration: minutes,
              expectedResult: field("expected").join("\n").slice(0, 5_000),
              warning: field("warning").join("\n").slice(0, 5_000),
              collapsed: false,
              branches,
            },
            nested,
          ),
        );
      }
      else out.push(node("text", { text: [{ text: "• " }, ...text] }, nested));
    }
    return out;
  };

  /** Re-nests Google Docs' flat lists by their level class. */
  const gdocsList = (lists: HTMLElement[]): BlockNode[] => {
    const roots: BlockNode[] = [];
    const stack: { level: number; node: BlockNode }[] = [];
    for (const l of lists) {
      const level = gdocsLevel(l);
      const items = listItems(l, tag(l) === "ol");
      for (const item of items) {
        while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
        if (stack.length) stack[stack.length - 1].node.children.push(item);
        else roots.push(item);
        stack.push({ level, node: item });
      }
    }
    return roots;
  };

  const blocks: BlockNode[] = [];
  const kids = [...body.childNodes]; // a work queue: wrapper elements are expanded into it
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    const t = tag(c);
    if (!isEl(c)) {
      const rt = tidy(inline(c));
      if (rt.length) blocks.push(node("text", { text: rt }));
      continue;
    }
    if (/^h[1-6]$/.test(t)) {
      const text = tidy(inline(c));
      if (!plain(text)) continue;
      const n = Number(t[1]);
      if (n === 1 && !sawTitleHeading && !blocks.length) {
        title = plain(text).slice(0, 200);
        sawTitleHeading = true;
        continue;
      }
      blocks.push(node("heading", { level: Math.min(3, Math.max(1, n - (sawTitleHeading ? 1 : 0))) as 1 | 2 | 3, text }));
    } else if (t === "p" || t === "div" || t === "section" || t === "article") {
      if (t !== "p" && c.childNodes.some((x) => isEl(x) && ["p", "ol", "ul", "table", "h1", "h2", "h3"].includes(tag(x)))) {
        // Wrapper element: process its children in place.
        kids.splice(i + 1, 0, ...c.childNodes);
        continue;
      }
      for (const img of c.querySelectorAll("img")) blocks.push(imageBlock(img, warnings));
      // Google Docs marks the document title with a "title" class (and "subtitle" for the subtitle).
      if ((c.getAttribute("class") ?? "").split(/\s+/).includes("title")) {
        title ||= c.text.trim().slice(0, 200) || null;
        continue;
      }
      const b = paragraph(tidy(inline(c)));
      if (b) blocks.push(b);
    } else if (t === "ol" || t === "ul") {
      if (!Number.isNaN(gdocsLevel(c))) {
        const group: HTMLElement[] = [c];
        const blank = (n: Node | undefined) => n !== undefined && n.nodeType === TEXT && !n.text.trim();
        for (;;) {
          let j = i + 1;
          while (blank(kids[j])) j++;
          const next = kids[j];
          if (!next || !["ol", "ul"].includes(tag(next)) || Number.isNaN(gdocsLevel(next as HTMLElement))) break;
          group.push(next as HTMLElement);
          i = j;
        }
        blocks.push(...gdocsList(group));
      } else {
        const items = listItems(c, t === "ol");
        const first = items[0];
        if (opts.restartLists && t === "ol" && first?.type === "step" && blocks.some((b) => b.type === "step") && (c.getAttribute("start") ?? "1") === "1") {
          first.content = { ...first.content, restart: true };
        }
        blocks.push(...items);
      }
    } else if (t === "table") {
      if (c.querySelector("tr")) blocks.push(tableBlock(c));
    } else if (t === "pre") {
      blocks.push(codeBlock(c));
    } else if (t === "blockquote") {
      const b = quoteBlock(c);
      if (b) blocks.push(b);
    } else if (t === "hr") {
      blocks.push(node("divider", {}));
    } else if (t === "img") {
      blocks.push(imageBlock(c, warnings));
    } else if (["script", "style", "head", "meta", "link", "title"].includes(t)) {
      continue;
    } else {
      const b = paragraph(tidy(inline(c)));
      if (b) blocks.push(b);
    }
  }
  if (!blocks.some((b) => b.type === "step")) warnings.add("No numbered lists were found, so there are no steps. Numbered lists become steps.");
  return { title, blocks: blocks.filter((b) => !(b.type === "image" && !b.content.url)), warnings: [...warnings] };
}

function tableBlock(c: HTMLElement): BlockNode {
  const rows = c.querySelectorAll("tr").map((tr) => tr.querySelectorAll("th,td").map((cell) => tidy(inline(cell))));
  return node("table", { headerRow: Boolean(c.querySelector("th")) || rows.length > 1, rows: rows.slice(0, 500).map((r) => r.slice(0, 30)) });
}

function codeBlock(c: HTMLElement): BlockNode {
  const codeEl = c.querySelector("code");
  const lang = (codeEl?.getAttribute("class") ?? "").match(/language-([\w-]+)/)?.[1] ?? "text";
  return node("code", { language: lang.slice(0, 40), code: (codeEl ?? c).text.replace(/\n$/, "").slice(0, 100_000) });
}

function imageBlock(img: HTMLElement, warnings: Set<string>): BlockNode {
  const src = img.getAttribute("src") ?? "";
  if (!/^(https:|data:image\/)/i.test(src)) {
    warnings.add("Some images couldn't be imported (they weren't embedded in the file).");
    return node("image", { url: "", caption: "", width: null, originalUrl: null, annotations: [] });
  }
  // SOP Markdown: ![Caption](file.png "width=480"); HTML: <img width="480">.
  const w = Number((img.getAttribute("title") ?? "").match(/width\s*=\s*(\d+)/i)?.[1] ?? img.getAttribute("width") ?? NaN);
  const width = Number.isFinite(w) && w >= 40 ? Math.min(4_000, Math.round(w)) : null;
  return node("image", { url: src, caption: (img.getAttribute("alt") ?? "").slice(0, 1000), width, originalUrl: null, annotations: [] });
}
