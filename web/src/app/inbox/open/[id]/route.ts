import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { notifications } from "@/db/schema";
import { getContext } from "@/server/context";
import { markRead } from "@/server/services/notifications";

/** Opening a notification marks it read and follows its link (always an in-app path). */
export async function GET(req: NextRequest, ctx: RouteContext<"/inbox/open/[id]">) {
  const { id } = await ctx.params;
  const { db, actor } = await getContext();
  if (!actor.userId) return NextResponse.redirect(new URL(`/login?next=/inbox`, req.url));
  const [n] = await db.select({ link: notifications.link }).from(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, actor.userId))).limit(1);
  if (n) await markRead(db, actor, [id]);
  const target = n?.link.startsWith("/") && !n.link.startsWith("//") ? n.link : "/inbox";
  return NextResponse.redirect(new URL(target, req.url));
}
