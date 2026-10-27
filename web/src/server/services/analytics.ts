import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { feedback, runs, runSteps, sops, sopViews } from "@/db/schema";
import { forbidden } from "@/server/errors";
import { canReadDrafts, type Actor } from "@/server/permissions";
import { totalDuration } from "@/blocks/tree";
import { blockLabel } from "./feedback";
import { getSopDocument, loadSop } from "./sops";

type Source = "app" | "share" | "embed" | "api" | "extension";

/** Records a read. The same person reading the same SOP within 30 minutes counts once. */
export async function recordView(db: Executor, actor: Actor, sopId: string, source: Source = "app") {
  const { sop } = await loadSop(db, actor, sopId);
  if (!sop.currentVersionId) return;
  if (actor.userId) {
    const [recent] = await db
      .select({ id: sopViews.id })
      .from(sopViews)
      .where(and(eq(sopViews.sopId, sopId), eq(sopViews.userId, actor.userId), gte(sopViews.viewedAt, new Date(Date.now() - 30 * 60_000))))
      .limit(1);
    if (recent) return;
  }
  await db.insert(sopViews).values({ workspaceId: actor.workspaceId, sopId, versionId: sop.currentVersionId, userId: actor.userId, source });
}

/** Same as recordView, for readers who aren't signed in to this workspace (share links, embeds). */
export async function recordAnonymousView(db: Executor, workspaceId: string, sopId: string, versionId: string | null, source: Source) {
  await db.insert(sopViews).values({ workspaceId, sopId, versionId, userId: null, source });
}

export type Analytics = {
  days: number;
  totals: { views: number; readers: number; runsCompleted: number; openFeedback: number };
  daily: { day: string; views: number }[];
  topSops: { id: string; title: string; documentCode: string; views: number; readers: number }[];
  skipped: { sopId: string; sopTitle: string; label: string; skipped: number; runs: number }[];
  runTimes: { sopId: string; sopTitle: string; runs: number; avgMinutes: number; estimatedMinutes: number | null }[];
  feedback: { sopId: string; sopTitle: string; unclear: number; wrong: number; other: number; open: number }[];
};

export async function getAnalytics(db: Executor, actor: Actor, days = 30): Promise<Analytics> {
  if (!canReadDrafts(actor)) throw forbidden("Only editors can see analytics.");
  const since = new Date(Date.now() - days * 864e5);
  const ws = eq(sops.workspaceId, actor.workspaceId);

  const [totals] = await db
    .select({ views: count(), readers: sql<number>`count(distinct ${sopViews.userId})::int` })
    .from(sopViews)
    .where(and(eq(sopViews.workspaceId, actor.workspaceId), gte(sopViews.viewedAt, since)));

  const dailyRows = await db
    .select({ day: sql<string>`to_char(date_trunc('day', ${sopViews.viewedAt}), 'YYYY-MM-DD')`, views: count() })
    .from(sopViews)
    .where(and(eq(sopViews.workspaceId, actor.workspaceId), gte(sopViews.viewedAt, since)))
    .groupBy(sql`1`);
  const byDay = new Map(dailyRows.map((r) => [r.day, Number(r.views)]));
  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10);
    return { day: d, views: byDay.get(d) ?? 0 };
  });

  const topSops = await db
    .select({ id: sops.id, title: sops.title, documentCode: sops.documentCode, views: count(), readers: sql<number>`count(distinct ${sopViews.userId})::int` })
    .from(sopViews)
    .innerJoin(sops, eq(sops.id, sopViews.sopId))
    .where(and(ws, gte(sopViews.viewedAt, since)))
    .groupBy(sops.id)
    .orderBy(desc(count()))
    .limit(10);

  // Skipped steps in completed runs, labelled with the step as it reads today.
  const skipRows = await db
    .select({ sopId: runs.sopId, sopTitle: sops.title, blockKey: runSteps.blockKey, skipped: count() })
    .from(runSteps)
    .innerJoin(runs, eq(runs.id, runSteps.runId))
    .innerJoin(sops, eq(sops.id, runs.sopId))
    .where(and(ws, eq(runSteps.skipped, true), eq(runs.status, "completed"), gte(runs.startedAt, since)))
    .groupBy(runs.sopId, sops.title, runSteps.blockKey)
    .orderBy(desc(count()))
    .limit(10);
  const runCounts = new Map(
    (
      await db
        .select({ sopId: runs.sopId, n: count() })
        .from(runs)
        .innerJoin(sops, eq(sops.id, runs.sopId))
        .where(and(ws, eq(runs.status, "completed"), gte(runs.startedAt, since)))
        .groupBy(runs.sopId)
    ).map((r) => [r.sopId, Number(r.n)]),
  );
  const docs = new Map<string, Awaited<ReturnType<typeof getSopDocument>> | null>();
  const docFor = async (id: string) => {
    if (!docs.has(id)) docs.set(id, await getSopDocument(db, actor, id).catch(() => null));
    return docs.get(id) ?? null;
  };
  const skipped = [];
  for (const r of skipRows) {
    const doc = await docFor(r.sopId);
    skipped.push({ sopId: r.sopId, sopTitle: r.sopTitle, label: (doc && blockLabel(doc.blocks, r.blockKey)) ?? "A step that has since been removed", skipped: Number(r.skipped), runs: runCounts.get(r.sopId) ?? 0 });
  }

  const timeRows = await db
    .select({
      sopId: runs.sopId,
      sopTitle: sops.title,
      runs: count(),
      avgMinutes: sql<number>`round(avg(extract(epoch from (${runs.completedAt} - ${runs.startedAt})) / 60))::int`,
    })
    .from(runs)
    .innerJoin(sops, eq(sops.id, runs.sopId))
    .where(and(ws, eq(runs.status, "completed"), gte(runs.startedAt, since)))
    .groupBy(runs.sopId, sops.title)
    .orderBy(desc(count()))
    .limit(10);
  const runTimes = [];
  for (const r of timeRows) {
    const doc = await docFor(r.sopId);
    const est = doc ? totalDuration(doc.blocks) : 0;
    runTimes.push({ sopId: r.sopId, sopTitle: r.sopTitle, runs: Number(r.runs), avgMinutes: r.avgMinutes, estimatedMinutes: est || null });
  }

  const fbRows = await db
    .select({
      sopId: feedback.sopId,
      sopTitle: sops.title,
      unclear: sql<number>`count(*) filter (where ${feedback.type} = 'unclear')::int`,
      wrong: sql<number>`count(*) filter (where ${feedback.type} = 'wrong')::int`,
      other: sql<number>`count(*) filter (where ${feedback.type} = 'other')::int`,
      open: sql<number>`count(*) filter (where ${feedback.status} = 'open')::int`,
    })
    .from(feedback)
    .innerJoin(sops, eq(sops.id, feedback.sopId))
    .where(and(ws, gte(feedback.createdAt, since)))
    .groupBy(feedback.sopId, sops.title)
    .orderBy(desc(count()))
    .limit(10);
  const [{ open }] = await db
    .select({ open: count() })
    .from(feedback)
    .where(and(eq(feedback.workspaceId, actor.workspaceId), eq(feedback.status, "open")));

  return {
    days,
    totals: { views: Number(totals.views), readers: totals.readers, runsCompleted: [...runCounts.values()].reduce((a, b) => a + b, 0), openFeedback: Number(open) },
    daily,
    topSops: topSops.map((r) => ({ ...r, views: Number(r.views) })),
    skipped,
    runTimes,
    feedback: fbRows,
  };
}
