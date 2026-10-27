import type { SnippetInfo } from "./render";
import type { BlockNode } from "./schema";

export type ResolvedSnippet = { name: string; version: number; blocks: BlockNode[] };
/** Looks up a snippet's blocks: a pinned version, or the latest when version is null. */
export type SnippetResolver = (snippetId: string, version: number | null) => ResolvedSnippet | null;

/**
 * Replaces each snippet reference's children with the snippet's blocks, so numbering, the table of contents,
 * runs and the PDF treat them as part of the SOP. Ids and keys are prefixed with the reference's, which keeps
 * them unique when a snippet appears twice and stable across versions of the SOP.
 */
export function expandSnippets(nodes: BlockNode[], resolve: SnippetResolver): { blocks: BlockNode[]; snippets: Record<string, SnippetInfo> } {
  const snippets: Record<string, SnippetInfo> = {};
  const visit = (list: BlockNode[]): BlockNode[] =>
    list.map((n) => {
      if (n.type !== "snippet_ref") return { ...n, children: visit(n.children) } as BlockNode;
      const found = resolve(n.content.snippetId, n.content.version);
      if (!found) return { ...n, children: [] };
      snippets[n.id] = { name: found.name, version: found.version, pinned: n.content.version !== null };
      return { ...n, children: prefix(found.blocks, n.id, n.key) };
    });
  return { blocks: visit(nodes), snippets };
}

function prefix(nodes: BlockNode[], idPrefix: string, keyPrefix: string): BlockNode[] {
  // Snippets can't contain snippets, so a nested reference here is dropped rather than expanded.
  return nodes
    .filter((n) => n.type !== "snippet_ref")
    .map((n) => ({ ...n, id: `${idPrefix}~${n.id}`, key: `${keyPrefix}~${n.key}`, children: prefix(n.children, idPrefix, keyPrefix) }) as BlockNode);
}

/** Every snippet a document references, with the pinned versions it needs. */
export function snippetRefs(nodes: BlockNode[]): { snippetId: string; version: number | null }[] {
  const out: { snippetId: string; version: number | null }[] = [];
  const visit = (list: BlockNode[]) =>
    list.forEach((n) => {
      if (n.type === "snippet_ref") out.push({ snippetId: n.content.snippetId, version: n.content.version });
      visit(n.children);
    });
  visit(nodes);
  return out;
}
