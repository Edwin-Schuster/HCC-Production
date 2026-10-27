import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { quizAttempts, quizzes, sops, sopVersions, trainingAssignments, users, type QuizQuestion } from "@/db/schema";
import { forbidden, invalid, notFound } from "@/server/errors";
import { atLeast, canEditSop, type Actor } from "@/server/permissions";
import { membersWithRole, notify } from "./notifications";
import { loadSop } from "./sops";

/**
 * Training: editors assign an SOP to people with an optional due date. If the SOP has a quiz, finishing means
 * passing it; otherwise it means confirming you've read it. The version they trained on is recorded.
 */

export const QuizInput = z.object({
  passPercent: z.number().int().min(1).max(100).default(80),
  questions: z
    .array(
      z
        .object({
          id: z.string().min(1).max(64),
          prompt: z.string().trim().min(1, "Every question needs a prompt").max(500),
          choices: z.array(z.string().trim().min(1, "Choices can't be empty").max(300)).min(2, "Give at least two choices").max(6),
          answer: z.number().int().min(0),
          explanation: z.string().trim().max(1_000).optional(),
        })
        .refine((q) => q.answer < q.choices.length, "Pick the correct answer for every question"),
    )
    .max(30),
});

export type QuizForTrainee = { passPercent: number; questions: { id: string; prompt: string; choices: string[] }[] };

export async function getQuiz(db: Executor, actor: Actor, sopId: string): Promise<{ passPercent: number; questions: QuizQuestion[] } | null> {
  const { sop, visibility } = await loadSop(db, actor, sopId);
  if (!canEditSop(actor, sop, visibility)) throw forbidden("Only editors can see quiz answers.");
  const [q] = await db.select().from(quizzes).where(eq(quizzes.sopId, sopId)).limit(1);
  return q ? { passPercent: q.passPercent, questions: q.questions } : null;
}

export async function saveQuiz(db: Executor, actor: Actor, sopId: string, input: z.input<typeof QuizInput>) {
  const { sop, visibility } = await loadSop(db, actor, sopId);
  if (!canEditSop(actor, sop, visibility)) throw forbidden("Only editors can write quizzes.");
  const data = QuizInput.parse(input);
  if (!data.questions.length) {
    await db.delete(quizzes).where(eq(quizzes.sopId, sopId));
    return;
  }
  await db
    .insert(quizzes)
    .values({ sopId, workspaceId: actor.workspaceId, questions: data.questions, passPercent: data.passPercent, updatedBy: actor.userId })
    .onConflictDoUpdate({ target: quizzes.sopId, set: { questions: data.questions, passPercent: data.passPercent, updatedBy: actor.userId, updatedAt: new Date() } });
}

export const AssignInput = z.object({
  userIds: z.array(z.string().max(64)).min(1, "Pick at least one person").max(200),
  dueAt: z.string().datetime().nullable().default(null),
  note: z.string().trim().max(1_000).default(""),
});

export async function assignTraining(db: Executor, actor: Actor, sopId: string, input: z.input<typeof AssignInput>) {
  const { sop, visibility } = await loadSop(db, actor, sopId);
  if (!canEditSop(actor, sop, visibility)) throw forbidden("Only editors can assign training.");
  if (!sop.currentVersionId) throw invalid("Publish the SOP before assigning it.");
  const data = AssignInput.parse(input);
  const members = new Set(await membersWithRole(db, actor.workspaceId, ["viewer", "editor", "admin"]));
  const open = new Set(
    (await db.select({ userId: trainingAssignments.userId }).from(trainingAssignments).where(and(eq(trainingAssignments.sopId, sopId), isNull(trainingAssignments.completedAt)))).map((r) => r.userId),
  );
  const toAssign = [...new Set(data.userIds)].filter((u) => members.has(u) && !open.has(u));
  if (!toAssign.length) return { assigned: 0 };
  await db.insert(trainingAssignments).values(toAssign.map((userId) => ({ workspaceId: actor.workspaceId, sopId, userId, assignedBy: actor.userId, note: data.note, dueAt: data.dueAt ? new Date(data.dueAt) : null })));
  await notify(db, {
    workspaceId: actor.workspaceId,
    userIds: toAssign,
    actorId: actor.userId,
    kind: "training_assigned",
    title: `${actor.name} assigned you training: ${sop.title}`,
    body: data.note || (data.dueAt ? `Due ${data.dueAt.slice(0, 10)}` : ""),
    link: "/training",
  });
  return { assigned: toAssign.length };
}

export type TrainingItem = {
  id: string;
  sopId: string;
  sopTitle: string;
  documentCode: string;
  userName: string;
  assignedByName: string | null;
  note: string;
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
  completedVersion: number | null;
  currentVersion: number | null;
  hasQuiz: boolean;
  bestScore: { score: number; total: number; passed: boolean } | null;
  overdue: boolean;
};

async function listAssignments(db: Executor, actor: Actor, where: ReturnType<typeof and>): Promise<TrainingItem[]> {
  const assigner = sql<string | null>`(select name from ${users} a where a.id = ${trainingAssignments.assignedBy})`;
  const completedVersion = sql<number | null>`(select version_number from ${sopVersions} v where v.id = ${trainingAssignments.completedVersionId})`;
  const currentVersion = sql<number | null>`(select version_number from ${sopVersions} v where v.id = ${sops.currentVersionId})`;
  const hasQuiz = sql<boolean>`exists (select 1 from ${quizzes} q where q.sop_id = ${trainingAssignments.sopId})`;
  const rows = await db
    .select({ a: trainingAssignments, sopTitle: sops.title, documentCode: sops.documentCode, userName: users.name, assigner, completedVersion, currentVersion, hasQuiz })
    .from(trainingAssignments)
    .innerJoin(sops, eq(sops.id, trainingAssignments.sopId))
    .innerJoin(users, eq(users.id, trainingAssignments.userId))
    .where(and(eq(trainingAssignments.workspaceId, actor.workspaceId), where))
    .orderBy(asc(trainingAssignments.completedAt), asc(trainingAssignments.dueAt), desc(trainingAssignments.createdAt));
  const attempts = rows.length
    ? await db
        .select()
        .from(quizAttempts)
        .where(inArray(quizAttempts.assignmentId, rows.map((r) => r.a.id)))
    : [];
  const now = Date.now();
  return rows.map((r) => {
    const mine = attempts.filter((x) => x.assignmentId === r.a.id).sort((x, y) => y.score / y.total - x.score / x.total);
    return {
      id: r.a.id,
      sopId: r.a.sopId,
      sopTitle: r.sopTitle,
      documentCode: r.documentCode,
      userName: r.userName,
      assignedByName: r.assigner,
      note: r.a.note,
      dueAt: r.a.dueAt?.toISOString() ?? null,
      createdAt: r.a.createdAt.toISOString(),
      completedAt: r.a.completedAt?.toISOString() ?? null,
      completedVersion: r.completedVersion,
      currentVersion: r.currentVersion,
      hasQuiz: r.hasQuiz,
      bestScore: mine[0] ? { score: mine[0].score, total: mine[0].total, passed: mine[0].passed } : null,
      overdue: !r.a.completedAt && Boolean(r.a.dueAt && r.a.dueAt.getTime() < now),
    };
  });
}

export async function listMyTraining(db: Executor, actor: Actor) {
  if (!actor.userId) return [];
  return listAssignments(db, actor, and(eq(trainingAssignments.userId, actor.userId)));
}

/** Everyone's training (editors), optionally for one SOP. */
export async function listTeamTraining(db: Executor, actor: Actor, sopId?: string) {
  if (!atLeast(actor, "editor")) throw forbidden("Only editors can see the team's training.");
  return listAssignments(db, actor, and(sopId ? eq(trainingAssignments.sopId, sopId) : undefined));
}

export async function openTraining(db: Executor, actor: Actor, assignmentId: string) {
  const [a] = await db.select().from(trainingAssignments).where(and(eq(trainingAssignments.id, assignmentId), eq(trainingAssignments.workspaceId, actor.workspaceId))).limit(1);
  if (!a || (a.userId !== actor.userId && !atLeast(actor, "editor"))) throw notFound("Training not found.");
  const [q] = await db.select().from(quizzes).where(eq(quizzes.sopId, a.sopId)).limit(1);
  const quiz: QuizForTrainee | null = q ? { passPercent: q.passPercent, questions: q.questions.map(({ id, prompt, choices }) => ({ id, prompt, choices })) } : null;
  const [item] = await listAssignments(db, actor, and(eq(trainingAssignments.id, a.id)));
  return { assignment: item, quiz, isMine: a.userId === actor.userId };
}

export const CompleteInput = z.object({ answers: z.array(z.number().int().min(-1).max(5)).max(30).optional() });

/** Finishes training: grades the quiz if there is one (and records the attempt), or confirms reading. */
export async function completeTraining(db: Executor, actor: Actor, assignmentId: string, input: z.input<typeof CompleteInput>) {
  const data = CompleteInput.parse(input);
  const [a] = await db.select().from(trainingAssignments).where(and(eq(trainingAssignments.id, assignmentId), eq(trainingAssignments.workspaceId, actor.workspaceId))).limit(1);
  if (!a || a.userId !== actor.userId) throw notFound("Training not found.");
  if (a.completedAt) throw invalid("You've already finished this training.");
  const { sop } = await loadSop(db, actor, a.sopId);
  if (!sop.currentVersionId) throw invalid("This SOP isn't published any more.");
  const [q] = await db.select().from(quizzes).where(eq(quizzes.sopId, a.sopId)).limit(1);
  let result: { score: number; total: number; passed: boolean; review: { id: string; correct: boolean; answer: number; explanation?: string }[] } | null = null;
  if (q) {
    const answers = data.answers ?? [];
    if (answers.length !== q.questions.length || answers.some((x) => x < 0)) throw invalid("Answer every question.");
    const review = q.questions.map((qq, i) => ({ id: qq.id, correct: answers[i] === qq.answer, answer: qq.answer, explanation: qq.explanation }));
    const score = review.filter((r) => r.correct).length;
    const passed = (score / q.questions.length) * 100 >= q.passPercent;
    await db.insert(quizAttempts).values({ workspaceId: actor.workspaceId, sopId: a.sopId, userId: actor.userId!, assignmentId: a.id, answers, score, total: q.questions.length, passed });
    result = { score, total: q.questions.length, passed, review };
    if (!passed) return { completed: false, result };
  }
  await db.update(trainingAssignments).set({ completedAt: new Date(), completedVersionId: sop.currentVersionId }).where(eq(trainingAssignments.id, a.id));
  if (a.assignedBy)
    await notify(db, { workspaceId: actor.workspaceId, userIds: [a.assignedBy], actorId: actor.userId, kind: "training_completed", title: `${actor.name} finished training: ${sop.title}`, body: result ? `Scored ${result.score}/${result.total}` : "", link: `/sops/${a.sopId}/training` });
  return { completed: true, result };
}

/** Open assignments for the nav badge. */
export async function openTrainingCount(db: Executor, actor: Actor) {
  if (!actor.userId) return 0;
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trainingAssignments)
    .where(and(eq(trainingAssignments.userId, actor.userId), isNull(trainingAssignments.completedAt)));
  return r?.n ?? 0;
}
