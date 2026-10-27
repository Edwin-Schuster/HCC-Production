import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { recordView } from "@/server/services/analytics";

/** Read tracking, sent from the browser so link prefetches don't count as reads. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/sops/[id]/view">) {
  const { id } = await ctx.params;
  const { db, actor } = await getContext();
  await recordView(db, actor, id).catch(() => {});
  return new NextResponse(null, { status: 204 });
}
