import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { toPublicError } from "@/server/errors";
import { openFile } from "@/server/services/files";

export async function GET(_req: NextRequest, ctx: RouteContext<"/files/[id]">) {
  try {
    const { id } = await ctx.params;
    const f = await openFile(await getDb(), id);
    return new NextResponse(f.stream, {
      headers: {
        "Content-Type": f.mime,
        "Content-Length": String(f.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"`,
      },
    });
  } catch (e) {
    const p = toPublicError(e);
    return new NextResponse(p.message, { status: p.status });
  }
}
