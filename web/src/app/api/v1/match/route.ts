import { api } from "@/server/api/handler";
import { urlMatches } from "@/lib/url-match";
import { listSops } from "@/server/services/sops";

/** SOPs about a web page (their "web pages" patterns match ?url=). Used by the browser extension. */
export const GET = api(async ({ db, actor, req }) => {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  const sops = (await listSops(db, actor, { status: "published" })).filter((s) => s.urlPatterns.some((p) => urlMatches(p, url)));
  return { sops: sops.map((s) => ({ id: s.id, documentCode: s.documentCode, title: s.title, summary: s.summary, url: `/sops/${s.id}` })) };
});
