import type { BlockNode } from "./schema";
import { numberSteps, plain } from "./tree";

/**
 * Version diff. Blocks are matched by their stable key, so a step that was reworded or moved is "changed"
 * or "moved" rather than removed-and-added. Text fields get a word-level diff.
 */

export type Segment = { op: "same" | "add" | "del"; text: string };
export type FieldChange = { field: string; label: string; segments: Segment[] };
export type DiffStatus = "same" | "added" | "removed" | "changed" | "moved";
export type DiffEntry = {
  key: string;
  status: DiffStatus;
  depth: number;
  /** The block as it is now (or as it was, for removed blocks). Children are not included. */
  node: BlockNode;
  number: string | null;
  oldNumber: string | null;
  fields: FieldChange[];
};

type Flat = { node: BlockNode; depth: number; parentKey: string | null; index: number; number: string | null };

function flat(tree: BlockNode[]): Flat[] {
  const numbers = numberSteps(tree);
  const out: Flat[] = [];
  const visit = (list: BlockNode[], depth: number, parentKey: string | null) =>
    list.forEach((node) => {
      out.push({ node, depth, parentKey, index: out.length, number: numbers.get(node.id) ?? null });
      visit(node.children, depth + 1, node.key);
    });
  visit(tree, 0, null);
  return out;
}

/** The comparable text fields of a block, labelled for display. */
export function fieldsOf(n: BlockNode): Record<string, [label: string, value: string]> {
  switch (n.type) {
    case "step":
      return {
        title: ["Title", plain(n.content.title)],
        description: ["Details", n.content.description],
        expectedResult: ["Expected result", n.content.expectedResult],
        warning: ["Warning", n.content.warning],
        roleId: ["Role", n.content.roleId ?? ""],
        estDuration: ["Minutes", n.content.estDuration ? String(n.content.estDuration) : ""],
        branches: ["Branches", n.content.branches.map((b) => `If ${b.condition} → ${b.target}`).join("\n")],
      };
    case "heading":
    case "text":
    case "callout":
      return { text: ["Text", plain(n.content.text)], ...(n.type === "callout" ? { variant: ["Type", n.content.variant] } : {}), ...(n.type === "heading" ? { level: ["Level", String(n.content.level)] } : {}) };
    case "checklist":
      return { text: ["Text", plain(n.content.text)] };
    case "code":
      return { code: ["Code", n.content.code], language: ["Language", n.content.language] };
    case "table":
      return { rows: ["Table", n.content.rows.map((r) => r.map(plain).join(" | ")).join("\n")] };
    case "image":
      return { url: ["Image", n.content.url], caption: ["Caption", n.content.caption] };
    case "video":
      return { url: ["Video", n.content.url], caption: ["Caption", n.content.caption] };
    case "embed":
      return { url: ["Embed", n.content.url], title: ["Title", n.content.title] };
    case "snippet_ref":
      return { snippet: ["Snippet", `${n.content.snippetId}${n.content.version ? ` v${n.content.version}` : ""}`] };
    case "divider":
      return {};
  }
}

/** Word-level diff (longest common subsequence over words and whitespace). */
export function diffWords(a: string, b: string): Segment[] {
  if (a === b) return a ? [{ op: "same", text: a }] : [];
  const x = a.split(/(\s+)/).filter(Boolean);
  const y = b.split(/(\s+)/).filter(Boolean);
  // Very long fields: fall back to a whole replacement rather than an O(n·m) table.
  if (x.length * y.length > 400_000) return [...(a ? [{ op: "del" as const, text: a }] : []), ...(b ? [{ op: "add" as const, text: b }] : [])];
  const dp = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Segment[] = [];
  const push = (op: Segment["op"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      push("same", x[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", x[i++]);
    else push("add", y[j++]);
  }
  while (i < x.length) push("del", x[i++]);
  while (j < y.length) push("add", y[j++]);
  return out;
}

export function diffVersions(oldTree: BlockNode[], newTree: BlockNode[]): DiffEntry[] {
  const before = flat(oldTree);
  const after = flat(newTree);
  const oldByKey = new Map(before.map((f) => [f.node.key, f]));
  const newKeys = new Set(after.map((f) => f.node.key));

  // Relative order of blocks that exist in both versions, to spot moves.
  const common = after.filter((f) => oldByKey.has(f.node.key));
  const oldRank = new Map(before.filter((f) => newKeys.has(f.node.key)).map((f, i) => [f.node.key, i]));

  const entries: DiffEntry[] = [];
  const emitRemovedBefore = (oldIndexLimit: number, emitted: Set<string>) => {
    for (const f of before) {
      if (f.index >= oldIndexLimit) break;
      if (!newKeys.has(f.node.key) && !emitted.has(f.node.key)) {
        emitted.add(f.node.key);
        entries.push({ key: f.node.key, status: "removed", depth: f.depth, node: { ...f.node, children: [] } as BlockNode, number: null, oldNumber: f.number, fields: [] });
      }
    }
  };
  const emitted = new Set<string>();
  for (const f of after) {
    const old = oldByKey.get(f.node.key);
    if (old) emitRemovedBefore(old.index, emitted);
    const node = { ...f.node, children: [] } as BlockNode;
    if (!old) {
      entries.push({ key: f.node.key, status: "added", depth: f.depth, node, number: f.number, oldNumber: null, fields: [] });
      continue;
    }
    const a = fieldsOf(old.node);
    const b = fieldsOf(f.node);
    const fields: FieldChange[] = [];
    if (old.node.type !== f.node.type) fields.push({ field: "type", label: "Block type", segments: [{ op: "del", text: old.node.type }, { op: "add", text: f.node.type }] });
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const va = a[k]?.[1] ?? "";
      const vb = b[k]?.[1] ?? "";
      if (va !== vb) fields.push({ field: k, label: (b[k] ?? a[k])[0], segments: diffWords(va, vb) });
    }
    const ci = common.indexOf(f);
    const moved = old.parentKey !== f.parentKey || (ci > 0 && oldRank.get(common[ci - 1].node.key)! > oldRank.get(f.node.key)!);
    entries.push({ key: f.node.key, status: fields.length ? "changed" : moved ? "moved" : "same", depth: f.depth, node, number: f.number, oldNumber: old.number, fields });
  }
  emitRemovedBefore(Infinity, emitted);
  return entries;
}

export function summarize(entries: DiffEntry[]) {
  const count = (s: DiffStatus) => entries.filter((e) => e.status === s).length;
  return { added: count("added"), removed: count("removed"), changed: count("changed"), moved: count("moved") };
}
