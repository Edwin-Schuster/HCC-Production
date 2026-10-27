"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { completeTrainingAction } from "@/app/actions/training";
import type { QuizForTrainee } from "@/server/services/training";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Result = { score: number; total: number; passed: boolean; review: { id: string; correct: boolean; answer: number; explanation?: string }[] };

export function TrainingFinish({ assignmentId, quiz }: { assignmentId: string; quiz: QuizForTrainee | null }) {
  const [answers, setAnswers] = useState<number[]>(() => quiz?.questions.map(() => -1) ?? []);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const res = await completeTrainingAction(assignmentId, quiz ? { answers } : {});
      if (!res.ok) return void toast.error(res.error);
      if (res.data.result) setResult(res.data.result);
      if (res.data.completed) toast("Training finished");
    });

  if (!quiz)
    return (
      <div className="grid gap-3">
        <p className="text-[14px] text-fg-2">When you've read it all and would know what to do, confirm below.</p>
        <Button variant="primary" className="justify-self-start" disabled={pending} onClick={submit}>
          <CheckCircle2 /> I've read and understood this SOP
        </Button>
      </div>
    );

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-[17px] font-[510] text-fg-hi">Quiz</h2>
        <p className="text-[13px] text-muted">
          {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"}. You need {quiz.passPercent}% to pass, and you can try again.
        </p>
      </div>
      {quiz.questions.map((q, i) => {
        const r = result?.review[i];
        return (
          <fieldset key={q.id} className="grid gap-1.5">
            <legend className="mb-1.5 text-[14px] font-[510] text-fg-hi">
              {i + 1}. {q.prompt}
            </legend>
            {q.choices.map((c, j) => (
              <label
                key={j}
                className={cn(
                  "flex items-center gap-2.5 rounded-[6px] border px-3 py-2 text-[14px]",
                  r && j === r.answer ? "border-good/50 bg-good-soft" : r && answers[i] === j && !r.correct ? "border-bad/50 bg-bad-soft" : "border-line hover:bg-wash-2",
                )}
              >
                <input type="radio" name={q.id} checked={answers[i] === j} onChange={() => setAnswers(answers.map((x, k) => (k === i ? j : x)))} disabled={pending} />
                {c}
              </label>
            ))}
            {r && !r.correct && r.explanation && <p className="text-[13px] text-muted">{r.explanation}</p>}
          </fieldset>
        );
      })}
      {result && (
        <p className={cn("flex items-center gap-2 text-[14px]", result.passed ? "text-good" : "text-bad")} role="status">
          {result.passed ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          {result.score}/{result.total}. {result.passed ? "Passed. Training finished." : "Not quite. Check the highlighted answers, re-read the SOP and try again."}
        </p>
      )}
      {!result?.passed && (
        <Button variant="primary" className="justify-self-start" disabled={pending || answers.some((a) => a < 0)} onClick={submit}>
          {result ? "Try again" : "Submit answers"}
        </Button>
      )}
    </div>
  );
}
