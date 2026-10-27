import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { toPublicError } from "@/server/errors";
import { openFile, RangeNotSatisfiable } from "@/server/services/files";

/** Parses "bytes=start-end" or "bytes=-N" (one range only, which is all video players ask for). */
function parseRange(header: string | null): { start: number; end: number } | undefined {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return undefined;
  if (!m[1]) return { start: -Number(m[2]), end: Number.MAX_SAFE_INTEGER };
  return { start: Number(m[1]), end: m[2] ? Number(m[2]) : Number.MAX_SAFE_INTEGER };
}

export async function GET(req: NextRequest, ctx: RouteContext<"/files/[id]">) {
  try {
    const { id } = await ctx.params;
    const f = await openFile(await getDb(), id, parseRange(req.headers.get("range")));
    const r = f.range;
    return new NextResponse(f.stream, {
      status: r ? 206 : 200,
      headers: {
        "Content-Type": f.mime,
        "Content-Length": String(r ? r.end - r.start + 1 : f.size),
        "Accept-Ranges": "bytes",
        ...(r ? { "Content-Range": `bytes ${r.start}-${r.end}/${f.size}` } : {}),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"`,
      },
    });
  } catch (e) {
    if (e instanceof RangeNotSatisfiable) return new NextResponse(null, { status: 416 });
    const p = toPublicError(e);
    return new NextResponse(p.message, { status: p.status });
  }
}
