"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { markReviewed } from "@/server/services/reviews";
import { markRead } from "@/server/services/notifications";
import { run } from "./run";

export async function markReviewedAction(sopId: string, note: string) {
  const res = await run((db, actor) => markReviewed(db, actor, z.string().min(1).max(64).parse(sopId), { note }));
  if (res.ok) refresh();
  return res;
}

export async function markAllReadAction() {
  const res = await run((db, actor) => markRead(db, actor, "all"));
  if (res.ok) refresh();
  return res;
}
