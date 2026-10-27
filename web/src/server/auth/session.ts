import crypto from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Executor } from "@/db";
import { sessions, users } from "@/db/schema";

export const SESSION_COOKIE = "hcc_session";
export const SESSION_DAYS = 30;
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function createSession(db: Executor, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function userForToken(db: Executor, token: string | undefined) {
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, username: users.username, name: users.name, email: users.email, disabled: users.disabled })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row && !row.disabled ? row : null;
}

export async function deleteSession(db: Executor, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export async function purgeExpiredSessions(db: Executor) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
