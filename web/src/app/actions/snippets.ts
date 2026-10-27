"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSnippet, deleteSnippet, updateSnippet, type SnippetInput } from "@/server/services/snippets";
import { run } from "./run";

const Id = z.string().min(1).max(64);

export async function createSnippetAction(input: z.input<typeof SnippetInput>) {
  const res = await run((db, actor) => createSnippet(db, actor, input));
  if (res.ok) redirect(`/snippets/${res.data.id}`);
  return res;
}

export async function updateSnippetAction(id: string, input: z.input<typeof SnippetInput>) {
  const res = await run((db, actor) => updateSnippet(db, actor, Id.parse(id), input));
  if (res.ok) refresh();
  return res;
}

export async function deleteSnippetAction(id: string) {
  const res = await run((db, actor) => deleteSnippet(db, actor, Id.parse(id)));
  if (res.ok) redirect("/snippets");
  return res;
}
