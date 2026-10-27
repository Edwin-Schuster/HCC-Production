import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db";

/** Liveness check for Docker and reverse proxies. */
export async function GET() {
  await connection();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
