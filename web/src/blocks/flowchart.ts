import type { BlockNode } from "./schema";
import { numberSteps, plain } from "./tree";

/**
 * Mermaid flowchart generated from an SOP's steps: steps in reading order (3 → 3.1 → 3.2 → 4),
 * grouped under their top-level headings, with branch rules as dashed, labelled jumps.
 */

const label = (s: string, max = 70) => {
  const clean = s.replace(/\s+/g, " ").trim();
  const cut = clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
  // Mermaid labels are quoted; escape what would end or break the quote.
  return cut.replace(/"/g, "#quot;").replace(/[<>]/g, (c) => (c === "<" ? "#lt;" : "#gt;"));
};

export function toMermaid(tree: BlockNode[]): string {
  const numbers = numberSteps(tree);
  const nodeId = new Map<string, string>(); // step key → mermaid id
  const sections: { title: string | null; lines: string[] }[] = [{ title: null, lines: [] }];
  const order: string[] = [];
  const branches: { from: string; condition: string; target: string }[] = [];

  const visit = (list: BlockNode[], depth: number) => {
    for (const n of list) {
      if (n.type === "heading" && depth === 0) sections.push({ title: plain(n.content.text), lines: [] });
      if (n.type === "step") {
        const id = `s${nodeId.size + 1}`;
        nodeId.set(n.key, id);
        order.push(id);
        const title = plain(n.content.title) || "Untitled step";
        const shape = n.content.branches.length ? [`{{"`, `"}}`] : [`["`, `"]`];
        sections[sections.length - 1].lines.push(`  ${id}${shape[0]}${numbers.get(n.id)}. ${label(title)}${shape[1]}`);
        for (const b of n.content.branches) branches.push({ from: id, condition: b.condition, target: b.target });
      }
      visit(n.children, depth + 1);
    }
  };
  visit(tree, 0);

  const out = ["flowchart TD", '  start(["Start"])', '  finish(["Done"])'];
  sections.forEach((s, i) => {
    if (!s.lines.length) return;
    if (s.title) out.push(`  subgraph sec${i}["${label(s.title, 50)}"]`, "  direction TB", ...s.lines.map((l) => `  ${l}`), "  end");
    else out.push(...s.lines);
  });
  const chain = ["start", ...order, "finish"];
  for (let i = 0; i < chain.length - 1; i++) out.push(`  ${chain[i]} --> ${chain[i + 1]}`);
  for (const b of branches) {
    const to = nodeId.get(b.target);
    if (to) out.push(`  ${b.from} -.->|"${label(b.condition, 40)}"| ${to}`);
  }
  return out.join("\n");
}
