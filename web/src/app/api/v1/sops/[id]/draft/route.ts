import { z } from "zod";
import { api, body } from "@/server/api/handler";
import { getEditorState, saveDraft } from "@/server/services/sops";
import { DocumentSchema } from "@/blocks/schema";

const Input = z.object({
  title: z.string().max(200).optional(),
  summary: z.string().max(1000).optional(),
  blocks: DocumentSchema,
  /** The draft's updatedAt you last read; if someone saved since, you get 409 instead of overwriting them. */
  baseUpdatedAt: z.string().datetime().optional(),
});

/** Replace the draft's content (editor key). Creates the draft from the current version if there isn't one. */
export const PUT = api<RouteContext<"/api/v1/sops/[id]/draft">>(async ({ db, actor, req, route }) => {
  const { id } = await route.params;
  const data = Input.parse(await body(req));
  const state = await getEditorState(db, actor, id);
  return saveDraft(db, actor, id, {
    title: data.title ?? state.title,
    summary: data.summary ?? state.summary,
    blocks: data.blocks,
    ...(state.draftExists ? { baseUpdatedAt: data.baseUpdatedAt ?? null } : { baseVersionId: state.baseVersionId }),
  });
});
