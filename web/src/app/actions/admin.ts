"use server";

import { refresh } from "next/cache";
import type { z } from "zod";
import { createFolder, deleteFolder, updateFolder, type FolderInput } from "@/server/services/folders";
import { upsertMember, type MemberInput } from "@/server/services/workspace";
import { updateBranding, type BrandingInput } from "@/server/services/branding";
import { run } from "./run";

export async function createFolderAction(input: z.input<typeof FolderInput>) {
  const res = await run((db, actor) => createFolder(db, actor, input).then((f) => ({ id: f.id })));
  if (res.ok) refresh();
  return res;
}

export async function updateFolderAction(id: string, input: Partial<z.input<typeof FolderInput>>) {
  const res = await run((db, actor) => updateFolder(db, actor, id, input).then(() => undefined));
  if (res.ok) refresh();
  return res;
}

export async function deleteFolderAction(id: string) {
  const res = await run((db, actor) => deleteFolder(db, actor, id));
  if (res.ok) refresh();
  return res;
}

export async function upsertMemberAction(input: z.input<typeof MemberInput>, userId?: string) {
  const res = await run((db, actor) => upsertMember(db, actor, input, userId));
  if (res.ok) refresh();
  return res;
}

export async function updateBrandingAction(input: z.input<typeof BrandingInput>) {
  const res = await run((db, actor) => updateBranding(db, actor, input).then(() => undefined));
  if (res.ok) refresh();
  return res;
}
