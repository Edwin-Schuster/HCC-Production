import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { toPublicError } from "@/server/errors";
import { renderPdf } from "@/server/pdf";
import { SESSION_COOKIE } from "@/server/auth/session";
import { getSopDocument } from "@/server/services/sops";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/sops/[id]/pdf">) {
  try {
    const { id } = await ctx.params;
    const sp = req.nextUrl.searchParams;
    const { db, actor } = await getContext();
    const want = sp.get("draft") ? "draft" : /^\d+$/.test(sp.get("v") ?? "") ? Number(sp.get("v")) : undefined;
    // Check access before starting a browser.
    const doc = await getSopDocument(db, actor, id, want);

    const base = process.env.INTERNAL_URL ?? (process.env.NODE_ENV === "development" ? req.nextUrl.origin : `http://127.0.0.1:${process.env.PORT ?? 3000}`);
    const q = new URLSearchParams();
    if (want === "draft") q.set("draft", "1");
    else if (typeof want === "number") q.set("v", String(want));
    const wm = sp.get("watermark");
    if (wm === "draft" || wm === "confidential") q.set("watermark", wm);
    const session = req.cookies.get(SESSION_COOKIE)?.value;
    const version = doc.version.isDraft ? "Draft" : `v${doc.version.number}`;
    const pdf = await renderPdf({
      url: `${base}/print/${id}?${q}`,
      cookies: session ? [{ name: SESSION_COOKIE, value: session }] : [],
      header: `${doc.branding.headerText ? `${doc.branding.headerText} · ` : ""}${doc.sop.documentCode} · ${doc.version.title} · ${version}`,
      footerLeft: `${doc.branding.footerText ? `${doc.branding.footerText} · ` : ""}${version}${doc.version.publishedAt ? ` · effective ${doc.version.publishedAt.slice(0, 10)}` : ""} · printed ${new Date().toISOString().slice(0, 10)} · uncontrolled when printed`,
    });
    const filename = `${doc.sop.documentCode} ${doc.version.title} ${version}.pdf`.replace(/[^\w .-]+/g, "");
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const p = toPublicError(e);
    return NextResponse.json({ error: p.message }, { status: p.status });
  }
}
