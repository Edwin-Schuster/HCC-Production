"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { decide, requestReview, type DecisionInput, type RequestReviewInput } from "@/server/services/approvals";
import { run } from "./run";

const Id = z.string().min(1).max(64);

export async function requestReviewAction(sopId: string, input: z.input<typeof RequestReviewInput>) {
  const res = await run((db, actor) => requestReview(db, actor, Id.parse(sopId), input));
  if (res.ok) refresh();
  return res;
}

export async function decideAction(sopId: string, input: z.input<typeof DecisionInput>) {
  const res = await run((db, actor) => decide(db, actor, Id.parse(sopId), input));
  if (res.ok) refresh();
  return res;
}
