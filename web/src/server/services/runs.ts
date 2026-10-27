import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { runs, runSteps, sops, sopVersions, users } from "@/db/schema";
import type { BlockNode } from "@/blocks/schema";
import { walk } from "@/blocks/tree";
import { forbidden, invalid, notFound } from "@/server/errors";
import { atLeast, canEditSop, type Actor } from "@/server/permissions";
import { getSopDocument, loadSop } from "./sops";
import { emit } from "./webhooks";

/** Blocks a run can tick off: every step (at any depth) and every checklist item. */
export function checkable(tree: BlockNode[]): BlockNode[] {
  return [...walk(tree)].map((x) => x.node).filter((n) => n.type === "step" || n.type === "checklist");
}

export const StartRunInput = z.object({ label: z.string().trim().max(120).default("") });

/** Starts working through the current published version as a checklist. */
export async function startRun(db: Executor, actor: Actor, sopId: string, input: z.input<typeof StartRunInput>) {
  if (!atLeast(actor, "viewer") || !actor.userId) throw forbidden("Sign in to start a run.");
  const { label } = StartRunInput.parse(input);
  const { sop } = await loadSop(db, actor, sopId);
  if (!sop.currentVersionId || sop.status === "retired") throw invalid("Only published SOPs can be run.");
  const [row] = await db.insert(runs).values({ workspaceId: actor.workspaceId, sopId, versionId: sop.currentVersionId, label, startedBy: actor.userId }).returning();
  return { id: row.id };
}

async function loadRun(db: Executor, actor: Actor, runId: string) {
  const [run] = await db.select().from(runs).where(and(eq(runs.id, runId), eq(runs.workspaceId, actor.workspaceId))).limit(1);
  if (!run) throw notFound("Run not found.");
  const loaded = await loadSop(db, actor, run.sopId); // also checks the reader can see the SOP
  return { run, ...loaded };
}

export type RunStepState = { blockId: string; completedAt: string | null; completedByName: string | null; skipped: boolean; note: string };

export async function getRun(db: Executor, actor: Actor, runId: string) {
  const { run, sop, visibility } = await loadRun(db, actor, runId);
  const [v] = await db.select({ number: sopVersions.versionNumber }).from(sopVersions).where(eq(sopVersions.id, run.versionId));
  const doc = await getSopDocument(db, actor, run.sopId, v.number!);
  const stepRows = await db
    .select({ s: runSteps, name: users.name })
    .from(runSteps)
    .leftJoin(users, eq(users.id, runSteps.completedBy))
    .where(eq(runSteps.runId, run.id));
  const [starter] = await db.select({ name: users.name }).from(users).where(eq(users.id, run.startedBy));
  const items = checkable(doc.blocks);
  const state: Record<string, RunStepState> = {};
  for (const { s, name } of stepRows) state[s.blockId] = { blockId: s.blockId, completedAt: s.completedAt?.toISOString() ?? null, completedByName: name, skipped: s.skipped, note: s.note };
  return {
    run: {
      id: run.id,
      label: run.label,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      startedByName: starter?.name ?? "Unknown",
      versionNumber: v.number!,
    },
    doc,
    total: items.length,
    done: items.filter((i) => state[i.id]?.completedAt).length,
    state,
    canFinish: run.startedBy === actor.userId || canEditSop(actor, sop, visibility),
  };
}

export const CheckInput = z.object({
  blockId: z.string().min(1).max(200),
  done: z.boolean(),
  note: z.string().trim().max(2_000).optional(),
});

/** Ticks or unticks one step, optionally with a note. Anyone who can read the SOP can help with a run. */
export async function checkStep(db: Executor, actor: Actor, runId: string, input: z.input<typeof CheckInput>) {
  if (!atLeast(actor, "viewer") || !actor.userId) throw forbidden("Sign in to work on a run.");
  const data = CheckInput.parse(input);
  const { run } = await loadRun(db, actor, runId);
  if (run.status !== "in_progress") throw invalid("This run is finished.");
  const [v] = await db.select({ number: sopVersions.versionNumber }).from(sopVersions).where(eq(sopVersions.id, run.versionId));
  const doc = await getSopDocument(db, actor, run.sopId, v.number!);
  const block = checkable(doc.blocks).find((b) => b.id === data.blockId);
  if (!block) throw invalid("That step isn't part of this run.");
  const values = {
    completedAt: data.done ? new Date() : null,
    completedBy: data.done ? actor.userId : null,
    skipped: false,
    ...(data.note !== undefined ? { note: data.note } : {}),
  };
  await db
    .insert(runSteps)
    .values({ runId: run.id, blockId: block.id, blockKey: block.key, note: "", ...values })
    .onConflictDoUpdate({ target: [runSteps.runId, runSteps.blockId], set: values });
}

/** Saves a note without changing whether the step is done. */
export async function noteStep(db: Executor, actor: Actor, runId: string, blockId: string, note: string) {
  const { run } = await loadRun(db, actor, runId);
  if (run.status !== "in_progress") throw invalid("This run is finished.");
  const text = z.string().trim().max(2_000).parse(note);
  const [existing] = await db.select().from(runSteps).where(and(eq(runSteps.runId, run.id), eq(runSteps.blockId, blockId))).limit(1);
  if (existing) await db.update(runSteps).set({ note: text }).where(and(eq(runSteps.runId, run.id), eq(runSteps.blockId, blockId)));
  else {
    const [v] = await db.select({ number: sopVersions.versionNumber }).from(sopVersions).where(eq(sopVersions.id, run.versionId));
    const doc = await getSopDocument(db, actor, run.sopId, v.number!);
    const block = checkable(doc.blocks).find((b) => b.id === blockId);
    if (!block) throw invalid("That step isn't part of this run.");
    await db.insert(runSteps).values({ runId: run.id, blockId, blockKey: block.key, note: text });
  }
}

/** Finishing records every unticked step as skipped, which feeds the "most skipped steps" report. */
export async function finishRun(db: Executor, actor: Actor, runId: string, status: "completed" | "abandoned") {
  const { run, sop, visibility } = await loadRun(db, actor, runId);
  if (run.status !== "in_progress") throw invalid("This run is already finished.");
  if (run.startedBy !== actor.userId && !canEditSop(actor, sop, visibility)) throw forbidden("Only the person who started this run, or an editor, can finish it.");
  if (status === "completed") {
    const [v] = await db.select({ number: sopVersions.versionNumber }).from(sopVersions).where(eq(sopVersions.id, run.versionId));
    const doc = await getSopDocument(db, actor, run.sopId, v.number!);
    const done = new Set((await db.select({ id: runSteps.blockId }).from(runSteps).where(and(eq(runSteps.runId, run.id), sql`${runSteps.completedAt} is not null`))).map((r) => r.id));
    const missed = checkable(doc.blocks).filter((b) => !done.has(b.id));
    for (const b of missed) {
      await db
        .insert(runSteps)
        .values({ runId: run.id, blockId: b.id, blockKey: b.key, skipped: true })
        .onConflictDoUpdate({ target: [runSteps.runId, runSteps.blockId], set: { skipped: true } });
    }
  }
  const completedAt = new Date();
  await db.update(runs).set({ status, completedAt }).where(eq(runs.id, run.id));
  if (status === "completed") {
    const skipped = (await db.select({ id: runSteps.blockId }).from(runSteps).where(and(eq(runSteps.runId, run.id), eq(runSteps.skipped, true)))).length;
    await emit(db, actor.workspaceId, "run.completed", { id: run.id, sopId: run.sopId, label: run.label, startedAt: run.startedAt.toISOString(), completedAt: completedAt.toISOString(), skippedSteps: skipped });
  }
}

export type RunSummary = {
  id: string;
  sopId: string;
  sopTitle: string;
  documentCode: string;
  label: string;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt: string | null;
  startedByName: string;
  versionNumber: number | null;
  done: number;
  skipped: number;
};

/** Runs for one SOP, or across the workspace (only SOPs the reader can see). */
export async function listRuns(db: Executor, actor: Actor, opts: { sopId?: string; status?: "in_progress" | "completed" | "abandoned"; limit?: number } = {}): Promise<RunSummary[]> {
  if (!actor.userId) return [];
  if (opts.sopId) await loadSop(db, actor, opts.sopId);
  const done = sql<number>`(select count(*)::int from ${runSteps} s where s.run_id = ${runs.id} and s.completed_at is not null)`;
  const skipped = sql<number>`(select count(*)::int from ${runSteps} s where s.run_id = ${runs.id} and s.skipped)`;
  const version = sql<number | null>`(select version_number from sop_versions v where v.id = ${runs.versionId})`;
  const rows = await db
    .select({ r: runs, sopTitle: sops.title, documentCode: sops.documentCode, folderId: sops.folderId, startedByName: users.name, done, skipped, version })
    .from(runs)
    .innerJoin(sops, eq(sops.id, runs.sopId))
    .innerJoin(users, eq(users.id, runs.startedBy))
    .where(and(eq(runs.workspaceId, actor.workspaceId), opts.sopId ? eq(runs.sopId, opts.sopId) : undefined, opts.status ? eq(runs.status, opts.status) : undefined))
    .orderBy(desc(runs.startedAt))
    .limit(Math.min(opts.limit ?? 50, 200));
  // Hide runs of SOPs the reader can't see (members-only or editors-only folders).
  const visible = new Set<string>();
  for (const sopId of new Set(rows.map((r) => r.r.sopId))) {
    try {
      await loadSop(db, actor, sopId);
      visible.add(sopId);
    } catch {
      /* not visible */
    }
  }
  return rows
    .filter((r) => visible.has(r.r.sopId))
    .map((r) => ({
      id: r.r.id,
      sopId: r.r.sopId,
      sopTitle: r.sopTitle,
      documentCode: r.documentCode,
      label: r.r.label,
      status: r.r.status,
      startedAt: r.r.startedAt.toISOString(),
      completedAt: r.r.completedAt?.toISOString() ?? null,
      startedByName: r.startedByName,
      versionNumber: r.version,
      done: r.done,
      skipped: r.skipped,
    }));
}

