import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { projects, tasks, users, workspaceMembers } from "@/db/schema";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, today, type ProjectStatus } from "@/lib/work";
import { forbidden, invalid, notFound } from "@/server/errors";
import { atLeast, type Actor } from "@/server/permissions";
import { describeChanges, logActivity } from "./activity";

/**
 * Projects: installs, upgrades and building work. Members see the schedule (name, status, dates, summary);
 * budgets, tasks and everything else are for editors.
 */

export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-05-01");
const Color = z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour");

export type ProjectSummary = { id: string; name: string; status: ProjectStatus; start: string | null; end: string | null; color: string; summary: string; updatedAt: string };
export type Project = ProjectSummary & {
  description: string;
  budgetCents: number;
  leadId: string | null;
  leadName: string | null;
  progress: { total: number; done: number; overdue: number };
};

export function requireEditor(actor: Actor, what = "project work") {
  if (!atLeast(actor, "editor")) throw forbidden(`Only editors can see ${what}.`);
}

const status = (s: string): ProjectStatus => ((PROJECT_STATUSES as readonly string[]).includes(s) ? (s as ProjectStatus) : "planning");

const summaryOf = (p: typeof projects.$inferSelect): ProjectSummary => ({
  id: p.id,
  name: p.name,
  status: status(p.status),
  start: p.start,
  end: p.end,
  color: p.color,
  summary: p.summary,
  updatedAt: p.updatedAt.toISOString(),
});

async function fullRows(db: Executor, actor: Actor, id?: string): Promise<Project[]> {
  const t = today();
  const total = sql<number>`(select count(*)::int from ${tasks} where ${tasks.projectId} = ${projects.id})`;
  const done = sql<number>`(select count(*)::int from ${tasks} where ${tasks.projectId} = ${projects.id} and ${tasks.status} = 'done')`;
  const overdue = sql<number>`(select count(*)::int from ${tasks} where ${tasks.projectId} = ${projects.id} and ${tasks.status} <> 'done' and ${tasks.due} < ${t})`;
  const rows = await db
    .select({ p: projects, leadName: users.name, total, done, overdue })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.leadId))
    .where(and(eq(projects.workspaceId, actor.workspaceId), id ? eq(projects.id, id) : undefined))
    .orderBy(sql`${projects.status} = 'complete'`, asc(projects.start), asc(projects.name));
  return rows.map(({ p, leadName, total, done, overdue }) => ({
    ...summaryOf(p),
    description: p.description,
    budgetCents: p.budgetCents,
    leadId: p.leadId,
    leadName,
    progress: { total, done, overdue },
  }));
}

/** Editors get everything; members get the public schedule fields only. */
export async function listProjects(db: Executor, actor: Actor): Promise<(Project | ProjectSummary)[]> {
  if (!atLeast(actor, "viewer")) throw forbidden("Sign in to see projects.");
  if (atLeast(actor, "editor")) return fullRows(db, actor);
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, actor.workspaceId))
    .orderBy(sql`${projects.status} = 'complete'`, asc(projects.start), asc(projects.name));
  return rows.map(summaryOf);
}

export async function getProject(db: Executor, actor: Actor, id: string): Promise<Project | ProjectSummary> {
  if (!atLeast(actor, "viewer")) throw forbidden("Sign in to see projects.");
  if (atLeast(actor, "editor")) {
    const [p] = await fullRows(db, actor, id);
    if (!p) throw notFound("Project not found.");
    return p;
  }
  const [p] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.workspaceId, actor.workspaceId))).limit(1);
  if (!p) throw notFound("Project not found.");
  return summaryOf(p);
}

/** Loads a project for a write by an editor, checking it's in the actor's workspace. */
export async function loadProject(db: Executor, actor: Actor, id: string) {
  requireEditor(actor);
  const [p] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.workspaceId, actor.workspaceId))).limit(1);
  if (!p) throw notFound("Project not found.");
  return p;
}

export const ProjectInput = z
  .object({
    name: z.string().trim().min(1, "Name the project").max(120),
    status: z.enum(PROJECT_STATUSES).default("planning"),
    start: Day.nullable().default(null),
    end: Day.nullable().default(null),
    color: Color.default("#a3a3a3"),
    summary: z.string().trim().max(300).default(""),
    description: z.string().max(20_000).default(""),
    /** Dollars, as typed. Stored in cents. */
    budget: z.number().min(0).max(100_000_000).default(0),
    leadId: z.string().max(64).nullable().default(null),
  })
  .refine((p) => !p.start || !p.end || p.end >= p.start, { message: "The finish date is before the start", path: ["end"] });

async function checkLead(db: Executor, actor: Actor, leadId: string | null) {
  if (!leadId) return;
  const [m] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, actor.workspaceId), eq(workspaceMembers.userId, leadId)))
    .limit(1);
  if (!m) throw invalid("The lead must be a member of this workspace.");
}

const LABELS = { name: "name", status: "status", start: "start date", end: "finish date", summary: "summary", description: "description", budgetCents: "budget", leadId: "lead" };

export async function createProject(db: Executor, actor: Actor, input: z.input<typeof ProjectInput>) {
  requireEditor(actor);
  const { budget, ...data } = ProjectInput.parse(input);
  await checkLead(db, actor, data.leadId);
  const [row] = await db
    .insert(projects)
    .values({ workspaceId: actor.workspaceId, ...data, budgetCents: Math.round(budget * 100) })
    .returning();
  await logActivity(db, actor, { projectId: row.id, targetType: "project", targetId: row.id, targetName: row.name, text: "created this project" });
  return row;
}

export async function updateProject(db: Executor, actor: Actor, id: string, input: z.input<typeof ProjectInput>) {
  const before = await loadProject(db, actor, id);
  const { budget, ...data } = ProjectInput.parse(input);
  await checkLead(db, actor, data.leadId);
  const next = { ...data, budgetCents: Math.round(budget * 100) };
  const [row] = await db.update(projects).set({ ...next, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
  const names = new Map<string, string>();
  for (const u of [before.leadId, row.leadId].filter(Boolean) as string[]) {
    const [x] = await db.select({ name: users.name }).from(users).where(eq(users.id, u)).limit(1);
    if (x) names.set(u, x.name);
  }
  const text = describeChanges(before, next, LABELS, (k, v) =>
    k === "status" ? PROJECT_STATUS_LABEL[status(String(v))] : k === "budgetCents" ? `$${(Number(v) / 100).toLocaleString("en-US")}` : k === "leadId" ? (names.get(String(v)) ?? "someone") : String(v),
  ).join(", ");
  await logActivity(db, actor, { projectId: id, targetType: "project", targetId: id, targetName: row.name, text });
  return row;
}

/** Deletes a project and everything in it (tasks, cables, layouts, purchasing, contractors' work). */
export async function deleteProject(db: Executor, actor: Actor, id: string) {
  await loadProject(db, actor, id);
  await db.delete(projects).where(eq(projects.id, id));
}
