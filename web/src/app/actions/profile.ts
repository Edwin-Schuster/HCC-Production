"use server";

import { refresh } from "next/cache";
import type { z } from "zod";
import { updateOwnProfile, type ProfileInput } from "@/server/services/workspace";
import { run } from "./run";

export async function saveProfileAction(input: z.input<typeof ProfileInput>) {
  const res = await run((db, actor) => updateOwnProfile(db, actor, input));
  if (res.ok) refresh();
  return res;
}
