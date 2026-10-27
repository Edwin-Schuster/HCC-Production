"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { assignTraining, completeTraining, saveQuiz, type AssignInput, type CompleteInput, type QuizInput } from "@/server/services/training";
import { run } from "./run";

const Id = z.string().min(1).max(64);
const done = <T,>(res: { ok: boolean } & T) => {
  if (res.ok) refresh();
  return res;
};

export const saveQuizAction = async (sopId: string, input: z.input<typeof QuizInput>) => done(await run((db, actor) => saveQuiz(db, actor, Id.parse(sopId), input)));
export const assignTrainingAction = async (sopId: string, input: z.input<typeof AssignInput>) => done(await run((db, actor) => assignTraining(db, actor, Id.parse(sopId), input)));
export const completeTrainingAction = async (id: string, input: z.input<typeof CompleteInput>) => done(await run((db, actor) => completeTraining(db, actor, Id.parse(id), input)));
