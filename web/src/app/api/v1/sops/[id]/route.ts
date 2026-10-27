import { api } from "@/server/api/handler";
import { getSopDocument } from "@/server/services/sops";

/** One SOP with its blocks. ?version=3 for an older version, ?version=draft for the draft (editors). */
export const GET = api<RouteContext<"/api/v1/sops/[id]">>(async ({ db, actor, req, route }) => {
  const { id } = await route.params;
  const v = new URL(req.url).searchParams.get("version");
  const doc = await getSopDocument(db, actor, id, v === "draft" ? "draft" : v && /^\d+$/.test(v) ? Number(v) : undefined);
  const { canEdit: _e, canManage: _m, ...rest } = doc;
  return rest;
});
