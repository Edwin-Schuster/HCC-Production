import { connection, NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { calendarFeed } from "@/server/services/calendar";

export async function GET(req: NextRequest) {
  await connection();
  const body = await calendarFeed(await getDb(), req.nextUrl.searchParams.get("token") ?? "", req.nextUrl.origin);
  if (!body) return new NextResponse("Calendar feed not found.", { status: 404 });
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "Content-Disposition": 'inline; filename="hcc-production.ics"' } });
}
