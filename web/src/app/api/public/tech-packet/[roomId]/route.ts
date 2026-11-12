import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { toPublicError } from "@/server/errors";
import { renderPdf } from "@/server/pdf";
import { publicRoom } from "@/server/services/public-site";

/** A room's tech packet as a PDF. Public: it shows only the room's public gear, stage plot and notes. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/public/tech-packet/[roomId]">) {
  try {
    const { roomId } = await ctx.params;
    const { db, actor } = await getContext();
    const room = await publicRoom(db, actor, roomId); // 404 before starting a browser
    const base = process.env.INTERNAL_URL ?? (process.env.NODE_ENV === "development" ? req.nextUrl.origin : `http://127.0.0.1:${process.env.PORT ?? 3000}`);
    const pdf = await renderPdf({
      url: `${base}/print/tech-packet/${room.id}`,
      cookies: [],
      header: `HCC Production · ${room.name} tech packet`,
      footerLeft: `Hope Christian Church · printed ${new Date().toISOString().slice(0, 10)}`,
    });
    const filename = `HCC ${room.name} tech packet.pdf`.replace(/[^\w .-]+/g, "");
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    const p = toPublicError(e);
    return NextResponse.json({ error: p.message }, { status: p.status });
  }
}
