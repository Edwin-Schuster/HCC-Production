"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkStep, finishRun, noteStep, startRun, type CheckInput } from "@/server/services/runs";
import { run } from "./run";

const Id = z.string().min(1).max(64);

export async function startRunAction(sopId: string, label = "") {
  const res = await run((db, actor) => startRun(db, actor, Id.parse(sopId), { label }));
  if (res.ok) redirect(`/runs/${res.data.id}`);
  return res;
}

export async function checkStepAction(runId: string, input: z.input<typeof CheckInput>) {
  return run((db, actor) => checkStep(db, actor, Id.parse(runId), input));
}

export async function noteStepAction(runId: string, blockId: string, note: string) {
  return run((db, actor) => noteStep(db, actor, Id.parse(runId), z.string().max(200).parse(blockId), note));
}

export async function finishRunAction(runId: string, status: "completed" | "abandoned") {
  const res = await run((db, actor) => finishRun(db, actor, Id.parse(runId), z.enum(["completed", "abandoned"]).parse(status)));
  if (res.ok) refresh();
  return res;
}
