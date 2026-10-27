import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { unlockShare } from "@/server/services/shares";

/** Password form for a protected share link. A wrong password returns to the form with ?wrong=1. */
export async function POST(req: NextRequest, ctx: RouteContext<"/s/[token]/unlock">) {
  const { token } = await ctx.params;
  const password = String((await req.formData()).get("password") ?? "").slice(0, 200);
  const value = await unlockShare(await getDb(), token, password);
  const res = NextResponse.redirect(new URL(`/s/${token}${value ? "" : "?wrong=1"}`, req.url), 303);
  if (value) res.cookies.set("hcc_share", value, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: `/s/${token}`, maxAge: 7 * 86400 });
  return res;
}
