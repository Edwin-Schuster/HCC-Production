import { Annotation, BranchRule, type BlockNode, type InlineRun, type RichText } from "@/blocks/schema";

/**
 * BlockNote's document ⇄ our stored block model. Only this file knows BlockNote's shapes,
 * so swapping editors later means rewriting this file, not the data.
 */

type BNStyles = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; code?: boolean };
type BNText = { type: "text"; text: string; styles?: BNStyles & Record<string, unknown> };
type BNLink = { type: "link"; href: string; content: BNText[] | string };
type BNInline = BNText | BNLink;
type BNTableCell = { type: "tableCell"; content: BNInline[]; props?: unknown };
export type BNBlock = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: unknown;
  children: BNBlock[];
};
export type BNPartial = { id?: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: BNPartial[] };

const SAFE_HREF = /^(https?:|mailto:|tel:|\/)/i;

export function inlineFromBN(content: unknown): RichText {
  if (!Array.isArray(content)) return typeof content === "string" && content ? [{ text: content }] : [];
  const out: InlineRun[] = [];
  for (const item of content as BNInline[]) {
    if (item.type === "text") out.push(run(item.text, item.styles));
    else if (item.type === "link") {
      const href = SAFE_HREF.test(item.href) ? item.href : undefined;
      const parts = typeof item.content === "string" ? [{ type: "text" as const, text: item.content }] : item.content;
      for (const t of parts) out.push({ ...run(t.text, t.styles), ...(href ? { href } : {}) });
    }
  }
  return merge(out.filter((r) => r.text.length));
}

function run(text: string, styles: BNStyles = {}): InlineRun {
  const r: InlineRun = { text };
  if (styles.bold) r.bold = true;
  if (styles.italic) r.italic = true;
  if (styles.underline) r.underline = true;
  if (styles.strike) r.strike = true;
  if (styles.code) r.code = true;
  return r;
}

/** Joins neighbouring runs with identical formatting. */
function merge(runs: InlineRun[]): RichText {
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
  return out;
}

export function inlineToBN(rt: RichText): BNInline[] {
  const out: BNInline[] = [];
  for (const r of rt) {
    const styles: BNStyles = {};
    if (r.bold) styles.bold = true;
    if (r.italic) styles.italic = true;
    if (r.underline) styles.underline = true;
    if (r.strike) styles.strike = true;
    if (r.code) styles.code = true;
    const t: BNText = { type: "text", text: r.text, styles };
    if (r.href) {
      const prev = out[out.length - 1];
      if (prev && prev.type === "link" && prev.href === r.href && Array.isArray(prev.content)) prev.content.push(t);
      else out.push({ type: "link", href: r.href, content: [t] });
    } else out.push(t);
  }
  return out;
}

const plainText = (content: unknown): string =>
  Array.isArray(content) ? (content as BNText[]).map((c) => c.text ?? "").join("") : typeof content === "string" ? content : "";

/** Image fields BlockNote's built-in image block has no props for, kept beside the editor by block id. */
export type ImageExtras = { originalUrl: string | null; annotations: Annotation[] };

function parseJsonArray<T>(raw: unknown, item: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }): T[] {
  let arr: unknown;
  try {
    arr = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr.flatMap((v) => {
    const r = item.safeParse(v);
    return r.success ? [r.data] : [];
  });
}

/**
 * BlockNote document → stored blocks. `keys` maps editor ids to stable keys (blocks loaded from the server);
 * `images` carries annotation data for image blocks.
 */
export function fromBlockNote(blocks: BNBlock[], keys: Map<string, string> = new Map(), images: Map<string, ImageExtras> = new Map()): BlockNode[] {
  const out: BlockNode[] = [];
  for (const b of blocks) {
    const children = fromBlockNote(b.children ?? [], keys, images);
    const base = { id: b.id, key: keys.get(b.id) ?? b.id, children };
    const p = b.props ?? {};
    switch (b.type) {
      case "heading": {
        const level = Math.min(3, Math.max(1, Number(p.level) || 2)) as 1 | 2 | 3;
        out.push({ ...base, type: "heading", content: { level, text: inlineFromBN(b.content) } });
        break;
      }
      case "paragraph":
        out.push({ ...base, type: "text", content: { text: inlineFromBN(b.content) } });
        break;
      case "checkListItem":
        out.push({ ...base, type: "checklist", content: { text: inlineFromBN(b.content), checked: Boolean(p.checked) } });
        break;
      case "codeBlock":
        out.push({ ...base, type: "code", content: { language: String(p.language || "text").slice(0, 40), code: plainText(b.content) } });
        break;
      case "table": {
        const tc = b.content as { rows?: { cells: (BNInline[] | BNTableCell)[] }[]; headerRows?: number } | undefined;
        const rows = (tc?.rows ?? []).map((r) => r.cells.map((c) => inlineFromBN(Array.isArray(c) ? c : c.content)));
        out.push({ ...base, type: "table", content: { headerRow: (tc?.headerRows ?? 0) > 0, rows } });
        break;
      }
      case "image": {
        const url = String(p.url ?? "");
        if (!url) {
          out.push(...children); // an empty image placeholder isn't content; keep anything nested in it
          break;
        }
        const width = typeof p.previewWidth === "number" ? Math.round(p.previewWidth) : null;
        const extra = images.get(b.id) ?? { originalUrl: null, annotations: [] };
        out.push({ ...base, type: "image", content: { url, caption: String(p.caption ?? ""), width: width && width >= 40 ? width : null, ...extra } });
        break;
      }
      case "video":
      case "embed": {
        const url = String(p.url ?? "");
        if (!url) {
          out.push(...children);
          break;
        }
        if (b.type === "video") out.push({ ...base, type: "video", content: { url, caption: String(p.caption ?? "") } });
        else out.push({ ...base, type: "embed", content: { url, title: String(p.title ?? ""), height: Math.min(2000, Math.max(120, Number(p.height) || 480)) } });
        break;
      }
      case "snippet": {
        const snippetId = String(p.snippetId ?? "");
        if (!snippetId) {
          out.push(...children);
          break;
        }
        const version = Number(p.version) > 0 ? Math.round(Number(p.version)) : null;
        out.push({ ...base, type: "snippet_ref", content: { snippetId, version } });
        break;
      }
      case "divider":
        out.push({ ...base, type: "divider", content: {} });
        break;
      case "step":
        out.push({
          ...base,
          type: "step",
          content: {
            title: inlineFromBN(b.content),
            description: String(p.description ?? ""),
            roleId: p.roleId ? String(p.roleId) : null,
            estDuration: Number(p.estDuration) > 0 ? Math.round(Number(p.estDuration)) : null,
            expectedResult: String(p.expectedResult ?? ""),
            warning: String(p.warning ?? ""),
            collapsed: Boolean(p.collapsed),
            branches: parseJsonArray(p.branches, BranchRule).slice(0, 10),
            ...(p.restart ? { restart: true } : {}),
          },
        });
        break;
      case "callout": {
        const v = p.variant === "warning" || p.variant === "danger" ? p.variant : "info";
        out.push({ ...base, type: "callout", content: { variant: v, text: inlineFromBN(b.content) } });
        break;
      }
      default:
        // Anything BlockNote creates that we don't model (e.g. pasted lists) is kept as text.
        out.push({ ...base, type: "text", content: { text: inlineFromBN(b.content) } });
    }
  }
  return out;
}

/** Stored blocks → BlockNote initial content (ids preserved). */
export function toBlockNote(nodes: BlockNode[]): BNPartial[] {
  return nodes.map((n) => {
    const children = toBlockNote(n.children);
    switch (n.type) {
      case "heading":
        return { id: n.id, type: "heading", props: { level: n.content.level }, content: inlineToBN(n.content.text), children };
      case "text":
        return { id: n.id, type: "paragraph", content: inlineToBN(n.content.text), children };
      case "checklist":
        return { id: n.id, type: "checkListItem", props: { checked: n.content.checked }, content: inlineToBN(n.content.text), children };
      case "code":
        return { id: n.id, type: "codeBlock", props: { language: n.content.language }, content: n.content.code, children };
      case "table": {
        const width = Math.max(1, ...n.content.rows.map((r) => r.length));
        return {
          id: n.id,
          type: "table",
          content: {
            type: "tableContent",
            headerRows: n.content.headerRow ? 1 : undefined,
            columnWidths: Array.from({ length: width }, () => undefined),
            rows: n.content.rows.map((r) => ({ cells: Array.from({ length: width }, (_, i) => ({ type: "tableCell", content: inlineToBN(r[i] ?? []) })) })),
          },
          children,
        };
      }
      case "image":
        return { id: n.id, type: "image", props: { url: n.content.url, caption: n.content.caption, ...(n.content.width ? { previewWidth: n.content.width } : {}) }, children };
      case "video":
        return { id: n.id, type: "video", props: { url: n.content.url, caption: n.content.caption }, children };
      case "embed":
        return { id: n.id, type: "embed", props: { url: n.content.url, title: n.content.title, height: n.content.height }, children };
      case "snippet_ref":
        return { id: n.id, type: "snippet", props: { snippetId: n.content.snippetId, version: n.content.version ?? 0 }, children };
      case "divider":
        return { id: n.id, type: "divider", children };
      case "step":
        return {
          id: n.id,
          type: "step",
          props: {
            description: n.content.description,
            roleId: n.content.roleId ?? "",
            estDuration: n.content.estDuration ?? 0,
            expectedResult: n.content.expectedResult,
            warning: n.content.warning,
            collapsed: n.content.collapsed,
            branches: JSON.stringify(n.content.branches),
            restart: Boolean(n.content.restart),
          },
          content: inlineToBN(n.content.title),
          children,
        };
      case "callout":
        return { id: n.id, type: "callout", props: { variant: n.content.variant }, content: inlineToBN(n.content.text), children };
    }
  });
}

/** Ids → keys for blocks loaded from the server, so keys survive editing. */
export function keyMap(nodes: BlockNode[], into = new Map<string, string>()): Map<string, string> {
  for (const n of nodes) {
    into.set(n.id, n.key);
    keyMap(n.children, into);
  }
  return into;
}

/** Annotation data for image blocks loaded from the server, by editor id. */
export function imageExtras(nodes: BlockNode[], into = new Map<string, ImageExtras>()): Map<string, ImageExtras> {
  for (const n of nodes) {
    if (n.type === "image" && (n.content.originalUrl || n.content.annotations.length)) into.set(n.id, { originalUrl: n.content.originalUrl, annotations: n.content.annotations });
    imageExtras(n.children, into);
  }
  return into;
}
