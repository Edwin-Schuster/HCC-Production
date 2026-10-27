import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { step } from "@/blocks/build";
import { createSop, publishDraft, saveDraft } from "@/server/services/sops";
import { assignTraining, completeTraining, listMyTraining, listTeamTraining, openTraining, saveQuiz } from "@/server/services/training";
import { testDb } from "./helpers";

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

async function sopWith(prefix: string) {
  const editor = await t.actorFor("editor", `${prefix}-ed`);
  const trainee = await t.actorFor("viewer", `${prefix}-tr`);
  const sop = await createSop(t.db, editor, { title: `${prefix} SOP`, folderId: t.general.id });
  await saveDraft(t.db, editor, sop.id, { title: `${prefix} SOP`, blocks: [step("a")] });
  await publishDraft(t.db, editor, sop.id, { changeSummary: "First version" });
  return { editor, trainee, sop };
}

describe("training", () => {
  it("without a quiz, finishing means confirming you've read it, and records the version", async () => {
    const { editor, trainee, sop } = await sopWith("tr1");
    expect(await assignTraining(t.db, editor, sop.id, { userIds: [trainee.userId!, trainee.userId!] })).toEqual({ assigned: 1 });
    expect(await assignTraining(t.db, editor, sop.id, { userIds: [trainee.userId!] })).toEqual({ assigned: 0 }); // already open
    const [mine] = await listMyTraining(t.db, trainee);
    await completeTraining(t.db, trainee, mine.id, {});
    const [done] = await listMyTraining(t.db, trainee);
    expect(done).toMatchObject({ completedVersion: 1, hasQuiz: false });
    await expect(completeTraining(t.db, trainee, mine.id, {})).rejects.toThrow(/already finished/);
  });

  it("with a quiz, hides answers from trainees, grades attempts, and finishes only on a pass", async () => {
    const { editor, trainee, sop } = await sopWith("tr2");
    await saveQuiz(t.db, editor, sop.id, {
      passPercent: 100,
      questions: [
        { id: "q1", prompt: "Amps go…", choices: ["first on", "last on"], answer: 1, explanation: "Amps are always last on." },
        { id: "q2", prompt: "Sample rate?", choices: ["44.1", "48"], answer: 1 },
      ],
    });
    await assignTraining(t.db, editor, sop.id, { userIds: [trainee.userId!] });
    const [a] = await listMyTraining(t.db, trainee);
    const opened = await openTraining(t.db, trainee, a.id);
    expect(JSON.stringify(opened.quiz)).not.toContain('"answer"');
    await expect(completeTraining(t.db, trainee, a.id, { answers: [1] })).rejects.toThrow(/Answer every question/);
    const fail = await completeTraining(t.db, trainee, a.id, { answers: [0, 1] });
    expect(fail).toMatchObject({ completed: false, result: { score: 1, total: 2, passed: false } });
    expect(fail.result!.review[0]).toMatchObject({ correct: false, answer: 1, explanation: "Amps are always last on." });
    const pass = await completeTraining(t.db, trainee, a.id, { answers: [1, 1] });
    expect(pass.completed).toBe(true);
    const [row] = await listTeamTraining(t.db, editor, sop.id);
    expect(row.bestScore).toEqual({ score: 2, total: 2, passed: true });
  });

  it("only editors assign or write quizzes, and only the trainee can finish their own", async () => {
    const { editor, trainee, sop } = await sopWith("tr3");
    await expect(assignTraining(t.db, trainee, sop.id, { userIds: [trainee.userId!] })).rejects.toThrow(/Only editors/);
    await expect(saveQuiz(t.db, trainee, sop.id, { questions: [] })).rejects.toThrow(/Only editors/);
    await assignTraining(t.db, editor, sop.id, { userIds: [trainee.userId!] });
    const [a] = await listMyTraining(t.db, trainee);
    await expect(completeTraining(t.db, editor, a.id, {})).rejects.toThrow(/not found/);
  });
});
