import { api, body } from "@/server/api/handler";
import { publishDraft } from "@/server/services/sops";

/** Publish the draft (editor key). Body: { changeSummary }. Folder approval rules still apply. */
export const POST = api<RouteContext<"/api/v1/sops/[id]/publish">>(async ({ db, actor, req, route }) => {
  const { id } = await route.params;
  return publishDraft(db, actor, id, (await body(req)) as { changeSummary: string });
});
