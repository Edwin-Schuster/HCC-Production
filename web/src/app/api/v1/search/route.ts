import { api } from "@/server/api/handler";
import { searchSops } from "@/server/services/search";

/** Full-text search. Hits name the matching step. ?q=…&limit=… */
export const GET = api(async ({ db, actor, req }) => {
  const sp = new URL(req.url).searchParams;
  return { results: await searchSops(db, actor, { q: sp.get("q") ?? "", limit: Math.min(50, Number(sp.get("limit")) || 25) }) };
});
