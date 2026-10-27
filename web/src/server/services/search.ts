import { and, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { blocks, sops, sopVersions } from "@/db/schema";
import { numberSteps, plain } from "@/blocks/tree";
import type { BlockNode } from "@/blocks/schema";
import { canReadDrafts, type Actor } from "@/server/permissions";
import { descendantIds, listFolders } from "./folders";
import { listSops, loadBlocks, type SopSummary } from "./sops";

/** Markers wrapped around matched words by ts_headline. Rendered as <mark> without ever using HTML. */
export const HL_START = "⁣[[";
export const HL_END = "]]⁣";

export const SearchInput = z.object({
  q: z.string().trim().max(200).default(""),
  ownerId: z.string().max(64).optional(),
  tag: z.string().max(40).optional(),
  status: z.enum(["draft", "in_review", "approved", "published", "retired"]).optional(),
  departmentId: z.string().max(64).optional(),
  limit: z.number().int().min(1).max(50).default(25),
});

export type SearchHit = {
  blockId: string;
  type: BlockNode["type"];
  /** "Step 3.2" or "Heading" etc. */
  label: string;
  /** Title of the step (or enclosing step) the match belongs to. */
  context: string;
  snippet: string;
};

export type SearchResult = SopSummary & { score: number; hits: SearchHit[]; titleMatch: boolean };

/** Prefix query so results appear while typing: "batt swap" → batt:* & swap:* */
export function toPrefixQuery(q: string): string | null {
  const words = (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  return words.length ? words.map((w) => `${w}:*`).join(" & ") : null;
}

export async function searchSops(db: Executor, actor: Actor, input: z.input<typeof SearchInput>): Promise<SearchResult[]> {
  const f = SearchInput.parse(input);
  let folderIds: string[] | undefined;
  if (f.departmentId) folderIds = [...descendantIds(await listFolders(db, actor), f.departmentId)];
  const visible = await listSops(db, actor, { folderIds, tag: f.tag, status: f.status, ownerId: f.ownerId });
  if (!visible.length) return [];

  const query = toPrefixQuery(f.q);
  if (!query) return visible.slice(0, f.limit).map((s) => ({ ...s, score: 0, hits: [], titleMatch: false }));

  // Which version of each SOP is searchable: the published one, or the draft for editors when never published.
  const versionOf = new Map<string, string>();
  const bySop = new Map(visible.map((s) => [s.id, s]));
  const ids = visible.map((s) => s.id);
  const currentRows = await db.select({ sopId: sops.id, currentVersionId: sops.currentVersionId }).from(sops).where(inArray(sops.id, ids));
  for (const r of currentRows) if (r.currentVersionId) versionOf.set(r.currentVersionId, r.sopId);
  if (canReadDrafts(actor)) {
    const neverPublished = currentRows.filter((r) => !r.currentVersionId).map((r) => r.sopId);
    if (neverPublished.length) {
      const drafts = await db.select({ id: sopVersions.id, sopId: sopVersions.sopId }).from(sopVersions).where(and(inArray(sopVersions.sopId, neverPublished), isNull(sopVersions.publishedAt)));
      for (const d of drafts) versionOf.set(d.id, d.sopId);
    }
  }

  const tsq = sql`to_tsquery('english', ${query})`;
  const titleRows = await db
    .select({ id: sops.id, rank: sql<number>`ts_rank(${sops.searchVector}, ${tsq})` })
    .from(sops)
    .where(and(inArray(sops.id, ids), sql`${sops.searchVector} @@ ${tsq}`));
  const versionIds = [...versionOf.keys()];
  const blockRows = versionIds.length
    ? (
        await db
          .select({
            id: blocks.id,
            versionId: blocks.versionId,
            rank: sql<number>`ts_rank(${blocks.searchVector}, ${tsq})`,
            snippet: sql<string>`ts_headline('english', ${blocks.searchText}, ${tsq}, ${`StartSel=${HL_START}, StopSel=${HL_END}, MaxWords=28, MinWords=10, MaxFragments=1`})`,
          })
          .from(blocks)
          .where(and(inArray(blocks.versionId, versionIds), sql`${blocks.searchVector} @@ ${tsq}`))
          .orderBy(sql`ts_rank(${blocks.searchVector}, ${tsq}) desc`)
          .limit(400)
      )
    : [];

  const scores = new Map<string, { score: number; titleMatch: boolean; blockIds: { id: string; snippet: string }[] }>();
  const bump = (sopId: string) => scores.get(sopId) ?? (scores.set(sopId, { score: 0, titleMatch: false, blockIds: [] }), scores.get(sopId)!);
  for (const r of titleRows) {
    const s = bump(r.id);
    s.score += Number(r.rank) * 3;
    s.titleMatch = true;
  }
  for (const r of blockRows) {
    const sopId = versionOf.get(r.versionId);
    if (!sopId) continue;
    const s = bump(sopId);
    if (s.blockIds.length < 3) s.score += Number(r.rank);
    if (s.blockIds.length < 3) s.blockIds.push({ id: r.id, snippet: r.snippet });
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, f.limit);
  const results: SearchResult[] = [];
  for (const [sopId, s] of ranked) {
    const sop = bySop.get(sopId)!;
    let hits: SearchHit[] = [];
    if (s.blockIds.length) {
      const versionId = [...versionOf.entries()].find(([, sid]) => sid === sopId)![0];
      hits = describeHits(await loadBlocks(db, versionId), s.blockIds);
    }
    results.push({ ...sop, score: s.score, titleMatch: s.titleMatch, hits });
  }
  return results;
}

const TYPE_LABEL: Record<BlockNode["type"], string> = {
  heading: "Heading",
  text: "Text",
  step: "Step",
  checklist: "Checklist",
  callout: "Callout",
  code: "Code",
  table: "Table",
  image: "Image",
  divider: "Divider",
};

/** Labels each matched block with its step number, or the step it sits inside. */
function describeHits(tree: BlockNode[], matched: { id: string; snippet: string }[]): SearchHit[] {
  const numbers = numberSteps(tree);
  const info = new Map<string, { node: BlockNode; step: BlockNode | null }>();
  const visit = (list: BlockNode[], enclosing: BlockNode | null) => {
    for (const node of list) {
      info.set(node.id, { node, step: enclosing });
      visit(node.children, node.type === "step" ? node : enclosing);
    }
  };
  visit(tree, null);
  return matched.flatMap(({ id, snippet }) => {
    const i = info.get(id);
    if (!i) return [];
    const stepNode = i.node.type === "step" ? i.node : i.step;
    const num = stepNode ? numbers.get(stepNode.id) : undefined;
    const label = i.node.type === "step" ? `Step ${num}` : num ? `${TYPE_LABEL[i.node.type]} in step ${num}` : TYPE_LABEL[i.node.type];
    const context = stepNode && stepNode.type === "step" ? plain(stepNode.content.title) : "";
    return [{ blockId: id, type: i.node.type, label, context, snippet }];
  });
}
