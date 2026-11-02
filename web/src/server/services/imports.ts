import { z } from "zod";
import type { Executor } from "@/db";
import { DocumentSchema } from "@/blocks/schema";
import { walk } from "@/blocks/tree";
import { finalizeImport, parseImport } from "@/server/import";
import { forbidden } from "@/server/errors";
import { canCreateSop, type Actor } from "@/server/permissions";
import { audit } from "./audit";
import { uploadImage } from "./files";
import { listFolders } from "./folders";
import { createSop, CreateSopInput, getOrCreateDraft, listTeamRoles, saveDraft } from "./sops";

/** Step 1: convert the file for preview. Embedded images are uploaded now so the preview can show them. */
export async function previewImport(db: Executor, actor: Actor, name: string, bytes: Uint8Array) {
  if (!canCreateSop(actor)) throw forbidden("Only editors can import SOPs.");
  const parsed = await parseImport(name, bytes);
  const notes = [...parsed.warnings];

  // Role names from SOP Markdown ("role: Audio") become this workspace's roles.
  const roles = new Map((await listTeamRoles(db, actor)).map((r) => [r.name.trim().toLowerCase(), r.id]));
  const unknown = new Set<string>();
  for (const { node } of walk(parsed.blocks)) {
    if (node.type !== "step" || !node.content.roleId?.startsWith("name:")) continue;
    const roleName = node.content.roleId.slice(5).trim();
    node.content.roleId = roles.get(roleName.toLowerCase()) ?? null;
    if (!node.content.roleId) unknown.add(roleName);
  }
  if (unknown.size) notes.push(`These roles aren't set up on the Roster, so those steps have no role yet: ${[...unknown].join(", ")}.`);

  const { blocks, warnings } = await finalizeImport(parsed.blocks, async (b, n) => (await uploadImage(db, actor, n, b)).url);
  const want = parsed.meta.folder?.trim().toLowerCase();
  const folder = want ? (await listFolders(db, actor)).find((f) => f.name.toLowerCase() === want || f.codePrefix.toLowerCase() === want) : undefined;
  if (want && !folder) notes.push(`There's no folder called "${parsed.meta.folder}". Pick one below.`);
  return {
    title: parsed.title ?? "Imported SOP",
    summary: parsed.meta.summary ?? "",
    tags: parsed.meta.tags ?? [],
    folderId: folder?.id ?? null,
    blocks,
    warnings: [...notes, ...warnings],
    fileName: name.slice(0, 200),
  };
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
