import type { BlockNode, BranchRule, CalloutVariant, InlineRun, RichText } from "./schema";

/** Small helpers to write block trees by hand (templates, seed data, tests). */
let counter = 0;
const nid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `b${Date.now()}${++counter}`);

/** "Use **bold** and `code`" → rich text runs. */
export function rt(s: string): RichText {
  const out: InlineRun[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ text: s.slice(last, m.index) });
    const tok = m[0];
    out.push(tok.startsWith("**") ? { text: tok.slice(2, -2), bold: true } : { text: tok.slice(1, -1), code: true });
    last = m.index! + tok.length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

const node = <T extends BlockNode["type"]>(type: T, content: Extract<BlockNode, { type: T }>["content"], children: BlockNode[] = []): BlockNode => {
  const id = nid();
  return { id, key: id, type, content, children } as BlockNode;
};

export const h = (text: string, level: 1 | 2 | 3 = 2) => node("heading", { level, text: rt(text) });
export const p = (text: string) => node("text", { text: rt(text) });
export const step = (
  title: string,
  opts: { description?: string; roleId?: string | null; minutes?: number | null; expected?: string; warning?: string; branches?: BranchRule[] } = {},
  children: BlockNode[] = [],
) =>
  node(
    "step",
    {
      title: rt(title),
      description: opts.description ?? "",
      roleId: opts.roleId ?? null,
      estDuration: opts.minutes ?? null,
      expectedResult: opts.expected ?? "",
      warning: opts.warning ?? "",
      collapsed: false,
      branches: opts.branches ?? [],
    },
    children,
  );
export const check = (text: string, checked = false) => node("checklist", { text: rt(text), checked });
export const callout = (variant: CalloutVariant, text: string) => node("callout", { variant, text: rt(text) });
export const code = (codeText: string, language = "text") => node("code", { language, code: codeText });
export const table = (rows: string[][], headerRow = true) => node("table", { headerRow, rows: rows.map((r) => r.map(rt)) });
export const image = (url: string, caption = "") => node("image", { url, caption, width: null, originalUrl: null, annotations: [] });
export const video = (url: string, caption = "") => node("video", { url, caption });
export const embed = (url: string, title = "", height = 480) => node("embed", { url, title, height });
export const snippetRef = (snippetId: string, version: number | null = null) => node("snippet_ref", { snippetId, version });
export const divider = () => node("divider", {});
