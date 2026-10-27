import { api, body } from "@/server/api/handler";
import { CreateSopInput, createSop, listSops, saveDraft, getOrCreateDraft } from "@/server/services/sops";
import { DocumentSchema } from "@/blocks/schema";

/** List SOPs the caller can read. ?folder=&tag=&status=&owner= */
export const GET = api(async ({ db, actor, req }) => {
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") as "draft" | "in_review" | "approved" | "published" | "retired" | null;
  return {
    sops: await listSops(db, actor, { folderIds: sp.get("folder") ? [sp.get("folder")!] : undefined, tag: sp.get("tag") ?? undefined, status: status ?? undefined, ownerId: sp.get("owner") ?? undefined }),
  };
});

/** Create an SOP (editor key). Optional `blocks` become its first draft; nothing is published. */
export const POST = api(async ({ db, actor, req }) => {
  const input = (await body(req)) as Record<string, unknown>;
  const meta = CreateSopInput.parse(input);
  const blocks = input.blocks === undefined ? null : DocumentSchema.parse(input.blocks);
  const created = await createSop(db, actor, meta);
  if (blocks) {
    const { draft } = await getOrCreateDraft(db, actor, created.id);
    await saveDraft(db, actor, created.id, { title: meta.title, summary: meta.summary, blocks, baseUpdatedAt: draft.updatedAt.toISOString() });
  }
  return Response.json({ id: created.id, documentCode: created.documentCode, url: `/sops/${created.id}` }, { status: 201 });
});
