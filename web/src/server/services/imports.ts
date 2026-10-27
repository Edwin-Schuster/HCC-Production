import { z } from "zod";
import type { Executor } from "@/db";
import { DocumentSchema } from "@/blocks/schema";
import { finalizeImport, parseImport } from "@/server/import";
import { forbidden } from "@/server/errors";
import { canCreateSop, type Actor } from "@/server/permissions";
import { audit } from "./audit";
import { uploadImage } from "./files";
import { createSop, CreateSopInput, getOrCreateDraft, saveDraft } from "./sops";

/** Step 1: convert the file for preview. Embedded images are uploaded now so the preview can show them. */
export async function previewImport(db: Executor, actor: Actor, name: string, bytes: Uint8Array) {
  if (!canCreateSop(actor)) throw forbidden("Only editors can import SOPs.");
  const parsed = await parseImport(name, bytes);
  const { blocks, warnings } = await finalizeImport(parsed.blocks, async (b, n) => (await uploadImage(db, actor, n, b)).url);
  return { title: parsed.title ?? "Imported SOP", blocks, warnings: [...parsed.warnings, ...warnings], fileName: name.slice(0, 200) };
}

export const CreateFromImportInput = CreateSopInput.omit({ templateKey: true }).extend({ blocks: DocumentSchema, fileName: z.string().max(200).default("") });

/** Step 2: create the SOP as a draft with the (reviewed) blocks. Nothing is published. */
export async function createFromImport(db: Executor, actor: Actor, input: z.input<typeof CreateFromImportInput>) {
  const { blocks, fileName, ...meta } = CreateFromImportInput.parse(input);
  const created = await createSop(db, actor, meta);
  const { draft } = await getOrCreateDraft(db, actor, created.id);
  await saveDraft(db, actor, created.id, { title: meta.title, summary: meta.summary, blocks, baseUpdatedAt: draft.updatedAt.toISOString() });
  await audit(db, actor, "sop.imported", { type: "sop", id: created.id }, { fileName, blocks: blocks.length });
  return created;
}
