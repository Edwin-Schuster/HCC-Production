"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSop, deleteSop, discardDraft, publishDraft, restoreVersion, setRetired, updateSopMeta, type CreateSopInput, type UpdateMetaInput } from "@/server/services/sops";
import { run } from "./run";

const Id = z.string().min(1).max(64);

export async function createSopAction(input: z.input<typeof CreateSopInput>) {
  const res = await run((db, actor) => createSop(db, actor, input));
  if (res.ok) redirect(`/sops/${res.data.id}/edit`);
  return res;
}

export async function publishAction(sopId: string, changeSummary: string) {
  const res = await run((db, actor) => publishDraft(db, actor, Id.parse(sopId), { changeSummary }));
  if (res.ok) revalidatePath("/sops", "layout");
  return res;
}

export async function discardDraftAction(sopId: string) {
  const res = await run((db, actor) => discardDraft(db, actor, Id.parse(sopId)));
  if (res.ok) redirect(`/sops/${sopId}`);
  return res;
}

export async function updateMetaAction(sopId: string, input: z.input<typeof UpdateMetaInput>) {
  const res = await run((db, actor) => updateSopMeta(db, actor, Id.parse(sopId), input));
  if (res.ok) refresh();
  return res;
}

export async function setRetiredAction(sopId: string, retired: boolean) {
  const res = await run((db, actor) => setRetired(db, actor, Id.parse(sopId), z.boolean().parse(retired)));
  if (res.ok) refresh();
  return res;
}

export async function deleteSopAction(sopId: string) {
  const res = await run((db, actor) => deleteSop(db, actor, Id.parse(sopId)));
  if (res.ok) redirect("/sops");
  return res;
}

export async function restoreVersionAction(sopId: string, versionNumber: number, replaceDraft: boolean) {
  const res = await run((db, actor) => restoreVersion(db, actor, Id.parse(sopId), z.number().int().min(1).parse(versionNumber), { replaceDraft }));
  if (res.ok) redirect(`/sops/${sopId}/edit`);
  return res;
}
