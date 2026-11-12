import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { bomItems, budgetLines, contractors, scopesOfWork } from "@/db/schema";
import { vendorFromUrl } from "@/lib/purchasing";
import type { Actor } from "@/server/permissions";
import { logActivity } from "./activity";
import { importCables, ImportCablesInput } from "./cabling";
import { ImportPortsInput, importPorts } from "./network";
import { createProject, loadProject } from "./projects";
import { syncProjectBudget } from "./purchasing";

/**
 * Saves a project workbook (read in the browser by lib/project-workbook.ts) into a project. Everything is
 * matched to what an earlier import created, so importing an updated workbook updates the project instead of
 * duplicating it. Statuses set in the app (ordered, received, signed, pulled…) are kept.
 */

const s = (max: number) => z.string().trim().max(max).default("");
export const WorkbookInput = z.object({
  budget: z.array(z.object({ category: z.string().trim().min(1).max(60), source: s(60), budget: z.number().min(0).max(100_000_000) })).max(200).default([]),
  items: z
    .array(z.object({ category: z.string().trim().min(1).max(60), section: s(120), item: z.string().trim().min(1).max(200), qty: z.number().min(0).max(1_000_000), unitCost: z.number().min(0).max(100_000_000), url: s(2_000), vendor: s(120) }))
    .max(5_000)
    .default([]),
  /** Budget groups that are a contractor's contract: one scope of work per budget line in the group. */
  contractors: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  cables: ImportCablesInput.nullable().default(null),
  ports: ImportPortsInput.nullable().default(null),
});

export type WorkbookResult = { budgetLines: number; items: { created: number; updated: number }; scopes: number; cables: { created: number; updated: number } | null; ports: { created: number; updated: number } | null };

const lc = (v: string) => v.trim().toLowerCase();

export async function importWorkbook(db: Executor, actor: Actor, projectId: string, input: z.input<typeof WorkbookInput>): Promise<WorkbookResult> {
  const project = await loadProject(db, actor, projectId);
  const data = WorkbookInput.parse(input);
  const result: WorkbookResult = { budgetLines: 0, items: { created: 0, updated: 0 }, scopes: 0, cables: null, ports: null };

  await db.transaction(async (tx) => {
    // Budget lines, in the workbook's order, ahead of any added in the app.
    const lines = await tx.select().from(budgetLines).where(eq(budgetLines.projectId, project.id));
    const byCat = new Map(lines.map((l) => [lc(l.category), l]));
    for (const [position, b] of data.budget.entries()) {
      const values = { category: b.category, source: b.source, budgetCents: Math.round(b.budget * 100), position };
      const found = byCat.get(lc(b.category));
      if (found) await tx.update(budgetLines).set({ ...values, updatedAt: new Date() }).where(eq(budgetLines.id, found.id));
      else await tx.insert(budgetLines).values({ workspaceId: actor.workspaceId, projectId: project.id, ...values });
      result.budgetLines++;
    }
    let after = data.budget.length;
    for (const l of lines) if (!data.budget.some((b) => lc(b.category) === lc(l.category))) await tx.update(budgetLines).set({ position: after++ }).where(eq(budgetLines.id, l.id));
    if (data.budget.length) await syncProjectBudget(tx, project.id);

    // Bill of materials: matched by category, section and item (the nth of identical rows to the nth).
    const existing = await tx.select().from(bomItems).where(eq(bomItems.projectId, project.id));
    const pool = new Map<string, (typeof existing)[number][]>();
    const key = (x: { category: string; section: string; item: string }) => `${lc(x.category)}|${lc(x.section)}|${lc(x.item)}`;
    for (const e of existing) pool.set(key(e), [...(pool.get(key(e)) ?? []), e]);
    // Workbook rows first, in the workbook's order; items added in the app keep their place after them.
    for (const [position, it] of data.items.entries()) {
      const values = { category: it.category, section: it.section, item: it.item, qty: it.qty, unitCostCents: Math.round(it.unitCost * 100), url: it.url, vendor: it.vendor || vendorFromUrl(it.url), position };
      const match = pool.get(key(it))?.shift();
      if (match) {
        const changed = match.qty !== values.qty || match.unitCostCents !== values.unitCostCents || match.url !== values.url || match.vendor !== values.vendor;
        if (match.position !== position && !changed) await tx.update(bomItems).set({ position }).where(eq(bomItems.id, match.id));
        if (changed) {
          await tx.update(bomItems).set({ ...values, updatedAt: new Date() }).where(eq(bomItems.id, match.id));
          result.items.updated++;
        }
      } else {
        await tx.insert(bomItems).values({ workspaceId: actor.workspaceId, projectId: project.id, ...values });
        result.items.created++;
      }
    }

    let next = data.items.length;
    for (const left of [...pool.values()].flat()) await tx.update(bomItems).set({ position: next++ }).where(eq(bomItems.id, left.id));

    // A contractor's contract: one scope of work per budget line, quoted at its budget.
    for (const company of data.contractors) {
      const groupLines = data.budget.filter((b) => lc(b.source) === lc(company));
      if (!groupLines.length) continue;
      let [c] = await tx.select().from(contractors).where(and(eq(contractors.workspaceId, actor.workspaceId), sql`lower(${contractors.company}) = ${lc(company)}`)).limit(1);
      if (!c) [c] = await tx.insert(contractors).values({ workspaceId: actor.workspaceId, company }).returning();
      const scopes = await tx.select().from(scopesOfWork).where(and(eq(scopesOfWork.contractorId, c.id), eq(scopesOfWork.projectId, project.id)));
      for (const b of groupLines) {
        const valueCents = Math.round(b.budget * 100);
        const found = scopes.find((x) => lc(x.title) === lc(b.category));
        if (found) await tx.update(scopesOfWork).set({ category: b.category, valueCents, updatedAt: new Date() }).where(eq(scopesOfWork.id, found.id));
        else await tx.insert(scopesOfWork).values({ workspaceId: actor.workspaceId, contractorId: c.id, projectId: project.id, title: b.category, category: b.category, status: "sent", valueCents });
        result.scopes++;
      }
    }
  });

  if (data.cables) result.cables = await importCables(db, actor, project.id, data.cables);
  if (data.ports) result.ports = await importPorts(db, actor, project.id, data.ports);
  await logActivity(db, actor, {
    projectId: project.id,
    targetType: "project",
    targetId: project.id,
    targetName: project.name,
    text: `imported the project workbook (${result.budgetLines} budget lines, ${result.items.created + result.items.updated} items changed, ${result.scopes} contractor scopes)`,
  });
  return result;
}

/** Starts a project from a workbook. */
export async function createProjectFromWorkbook(db: Executor, actor: Actor, name: string, input: z.input<typeof WorkbookInput>) {
  const project = await createProject(db, actor, { name, status: "planning" });
  const result = await importWorkbook(db, actor, project.id, input);
  return { id: project.id, result };
}
