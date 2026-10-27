import { connection, NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { toPublicError } from "@/server/errors";
import { searchSops } from "@/server/services/search";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const sp = req.nextUrl.searchParams;
    const { db, actor } = await getContext();
    const results = await searchSops(db, actor, {
      q: sp.get("q") ?? "",
      limit: Number(sp.get("limit") ?? 25) || 25,
      tag: sp.get("tag") || undefined,
      ownerId: sp.get("owner") || undefined,
      status: (sp.get("status") || undefined) as never,
      departmentId: sp.get("dept") || undefined,
    });
    return NextResponse.json({
      results: results.map((r) => ({ id: r.id, title: r.title, documentCode: r.documentCode, hits: r.hits.map((h) => ({ blockId: h.blockId, label: h.label, snippet: h.snippet })) })),
    });
  } catch (e) {
    const p = toPublicError(e);
    return NextResponse.json({ error: p.message }, { status: p.status });
  }
}
