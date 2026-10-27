import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { toPublicError } from "@/server/errors";
import { saveDraft } from "@/server/services/sops";

const MAX_BODY = 4 * 1024 * 1024;

/** Autosave. A Route Handler (not a Server Action) so saves don't queue behind other actions and can use keepalive. */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/sops/[id]/draft">) {
  try {
    const { id } = await ctx.params;
    const text = await req.text();
    if (text.length > MAX_BODY) return NextResponse.json({ error: "This SOP is too large to save. Split it into smaller SOPs." }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }
    const { db, actor } = await getContext();
    const result = await saveDraft(db, actor, id, body as never);
    return NextResponse.json(result);
  } catch (e) {
    const p = toPublicError(e);
    return NextResponse.json({ error: p.message, code: p.code, details: p.details }, { status: p.status });
  }
}
