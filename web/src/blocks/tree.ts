import type { BlockNode, RichText } from "./schema";

export const plain = (rt: RichText | undefined): string => (rt ?? []).map((r) => r.text).join("");

export function* walk(nodes: BlockNode[], depth = 0, parent: BlockNode | null = null): Generator<{ node: BlockNode; depth: number; parent: BlockNode | null }> {
  for (const node of nodes) {
    yield { node, depth, parent };
    yield* walk(node.children, depth + 1, node);
  }
}

/**
 * Step numbers: top-level steps count 1, 2, 3 across the whole document; sub-steps of step 3 are 3.1, 3.2,
 * and their sub-steps 3.2.1. Non-step blocks never take a number. A step nested under a non-step block
 * (for example inside a callout) continues the numbering of the enclosing scope, so numbers never repeat.
 */
export function numberSteps(nodes: BlockNode[]): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (list: BlockNode[], prefix: string, counter: { n: number }) => {
    for (const node of list) {
      if (node.type === "step") {
        counter.n += 1;
        const label = prefix ? `${prefix}.${counter.n}` : String(counter.n);
        out.set(node.id, label);
        visit(node.children, label, { n: 0 });
      } else {
        visit(node.children, prefix, counter);
      }
    }
  };
  visit(nodes, "", { n: 0 });
  return out;
}

/** Step text fields allow **bold** and `code`; search should see the words, not the marks. */
const stripMarks = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");

/** Plain text of one block (not its children), used for full-text search and outlines. */
export function blockText(node: BlockNode): string {
  switch (node.type) {
    case "heading":
    case "text":
    case "checklist":
    case "callout":
      return plain(node.content.text);
    case "step":
      return [plain(node.content.title), ...[node.content.description, node.content.expectedResult, node.content.warning].map(stripMarks)].filter(Boolean).join("\n");
    case "code":
      return node.content.code;
    case "table":
      return node.content.rows.map((r) => r.map(plain).join(" | ")).join("\n");
    case "image":
    case "video":
      return node.content.caption;
    case "embed":
      return node.content.title;
    case "snippet_ref":
    case "divider":
      return "";
  }
}

export type FlatBlock = { id: string; key: string; parentId: string | null; position: number; node: BlockNode };

/** Tree → ordered rows with parent ids and sibling positions (what the blocks table stores). */
export function flatten(nodes: BlockNode[]): FlatBlock[] {
  const rows: FlatBlock[] = [];
  const visit = (list: BlockNode[], parentId: string | null) =>
    list.forEach((node, position) => {
      rows.push({ id: node.id, key: node.key, parentId, position, node });
      visit(node.children, node.id);
    });
  visit(nodes, null);
  return rows;
}

/** Rows → tree. Orphans (parent missing) are attached at the root rather than dropped. */
export function buildTree<R extends { id: string; parentId: string | null; position: number }>(rows: R[], toNode: (row: R) => Omit<BlockNode, "children">): BlockNode[] {
  const byId = new Map<string, BlockNode>();
  for (const r of rows) byId.set(r.id, { ...toNode(r), children: [] } as BlockNode);
  const roots: { pos: number; node: BlockNode }[] = [];
  const kids = new Map<string, { pos: number; node: BlockNode }[]>();
  for (const r of rows) {
    const entry = { pos: r.position, node: byId.get(r.id)! };
    if (r.parentId && byId.has(r.parentId)) {
      const arr = kids.get(r.parentId) ?? [];
      arr.push(entry);
      kids.set(r.parentId, arr);
    } else roots.push(entry);
  }
  const sort = (a: { pos: number }, b: { pos: number }) => a.pos - b.pos;
  for (const [pid, arr] of kids) byId.get(pid)!.children = arr.sort(sort).map((e) => e.node);
  return roots.sort(sort).map((e) => e.node);
}

/** Give every block a fresh id while keeping its key (used when copying a version into a new draft). */
export function cloneWithNewIds(nodes: BlockNode[], newId: () => string = () => crypto.randomUUID()): BlockNode[] {
  return nodes.map((n) => ({ ...n, id: newId(), key: n.key, children: cloneWithNewIds(n.children, newId) }) as BlockNode);
}

/** Template blocks get fresh ids and keys so documents never share identity. */
export function instantiate(nodes: BlockNode[], newId: () => string = () => crypto.randomUUID()): BlockNode[] {
  return nodes.map((n) => {
    const id = newId();
    return { ...n, id, key: id, children: instantiate(n.children, newId) } as BlockNode;
  });
}

export type OutlineItem = { id: string; label: string; number?: string; level: number };

/** Table of contents: headings plus top-level steps. */
export function outline(nodes: BlockNode[], numbers = numberSteps(nodes)): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const { node, depth } of walk(nodes)) {
    if (node.type === "heading" && depth === 0) items.push({ id: node.id, label: plain(node.content.text), level: node.content.level });
    else if (node.type === "step" && depth === 0) items.push({ id: node.id, label: plain(node.content.title), number: numbers.get(node.id), level: 4 });
  }
  return items.filter((i) => i.label.trim());
}

export function totalDuration(nodes: BlockNode[]): number {
  let mins = 0;
  for (const { node } of walk(nodes)) if (node.type === "step") mins += node.content.estDuration ?? 0;
  return mins;
}

export function formatMinutes(m: number | null | undefined): string {
  if (!m) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
