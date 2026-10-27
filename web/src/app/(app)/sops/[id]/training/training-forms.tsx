"use client";

import { GraduationCap, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { assignTrainingAction, saveQuizAction } from "@/app/actions/training";
import type { QuizQuestion } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

export function AssignForm({ sopId, members }: { sopId: string; members: { id: string; name: string }[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await assignTrainingAction(sopId, { userIds: picked, dueAt: due ? new Date(`${due}T23:59:00`).toISOString() : null, note });
          if (!res.ok) return void toast.error(res.error);
          toast(res.data.assigned ? `Assigned to ${res.data.assigned} ${res.data.assigned === 1 ? "person" : "people"}` : "They already have this assigned");
          setPicked([]);
          setNote("");
        });
      }}
    >
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[13px] has-[:checked]:border-fg-2 has-[:checked]:bg-wash">
            <input type="checkbox" className="sr-only" checked={picked.includes(m.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))} />
            {m.name}
          </label>
        ))}
        <button type="button" className="text-xs text-muted underline underline-offset-2" onClick={() => setPicked(picked.length === members.length ? [] : members.map((m) => m.id))}>
          {picked.length === members.length ? "None" : "Everyone"}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Due" htmlFor="due">
          <Input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="note">
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Before you run sound on your own" />
        </Field>
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={pending || !picked.length}>
          <GraduationCap /> Assign
        </Button>
      </div>
    </form>
  );
}

const blank = (): QuizQuestion => ({ id: crypto.randomUUID(), prompt: "", choices: ["", ""], answer: 0 });

export function QuizEditor({ sopId, initial }: { sopId: string; initial: { passPercent: number; questions: QuizQuestion[] } | null }) {
  const [questions, setQuestions] = useState<QuizQuestion[]>(initial?.questions ?? []);
  const [pass, setPass] = useState(initial?.passPercent ?? 80);
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<QuizQuestion>) => setQuestions(questions.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  return (
    <div className="grid gap-4">
      {questions.map((q, i) => (
        <div key={q.id} className="grid gap-2 rounded-[12px] border border-line bg-surface p-4">
          <div className="flex items-start gap-2">
            <span className="mt-2 font-mono text-xs text-muted">{i + 1}.</span>
            <Textarea value={q.prompt} onChange={(e) => update(i, { prompt: e.target.value })} rows={2} placeholder="Question" aria-label={`Question ${i + 1}`} />
            <Button size="icon-sm" variant="ghost" aria-label="Remove question" onClick={() => setQuestions(questions.filter((_, k) => k !== i))}>
              <Trash2 />
            </Button>
          </div>
          {q.choices.map((c, j) => (
            <label key={j} className="ml-5 flex items-center gap-2">
              <input type="radio" name={`answer-${q.id}`} checked={q.answer === j} onChange={() => update(i, { answer: j })} aria-label={`Choice ${j + 1} is correct`} />
              <Input value={c} onChange={(e) => update(i, { choices: q.choices.map((x, k) => (k === j ? e.target.value : x)) })} placeholder={`Choice ${j + 1}`} className="h-8" />
              {q.choices.length > 2 && (
                <button type="button" className="text-faint hover:text-fg-hi" aria-label="Remove choice" onClick={() => update(i, { choices: q.choices.filter((_, k) => k !== j), answer: q.answer >= j && q.answer > 0 ? q.answer - 1 : q.answer })}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </label>
          ))}
          <div className="ml-5 flex flex-wrap items-center gap-2">
            {q.choices.length < 6 && (
              <Button size="sm" variant="ghost" onClick={() => update(i, { choices: [...q.choices, ""] })}>
                <Plus /> Choice
              </Button>
            )}
            <Input value={q.explanation ?? ""} onChange={(e) => update(i, { explanation: e.target.value })} placeholder="Explanation shown after a wrong answer (optional)" className="h-8 min-w-60 flex-1" />
          </div>
          <p className="ml-5 text-xs text-faint">Tick the correct answer.</p>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => setQuestions([...questions, blank()])}>
          <Plus /> Question
        </Button>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Pass mark <Input type="number" min={1} max={100} value={pass} onChange={(e) => setPass(Number(e.target.value))} className="h-8 w-20" />%
        </label>
        <span className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveQuizAction(sopId, { passPercent: pass, questions: questions.map((q) => ({ ...q, explanation: q.explanation || undefined })) });
              if (res.ok) toast(questions.length ? "Quiz saved" : "Quiz removed");
              else toast.error(res.error);
            })
          }
        >
          Save quiz
        </Button>
      </div>
    </div>
  );
}
