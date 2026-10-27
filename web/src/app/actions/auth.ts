"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { checkPassword, hashPassword } from "@/server/auth/password";
import { createSession, deleteSession, SESSION_COOKIE, SESSION_DAYS } from "@/server/auth/session";
import { getActor } from "@/server/context";

const fails = new Map<string, { n: number; t: number }>();

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/sops");

export async function login(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const f = fails.get(ip) ?? { n: 0, t: 0 };
  if (f.n >= 8 && Date.now() - f.t < 10 * 60_000) return { error: "Too many attempts. Try again in 10 minutes." };

  const parsed = z.object({ username: z.string().trim().toLowerCase().min(1).max(80), password: z.string().min(1).max(200) }).safeParse({
    username: form.get("username"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: "Enter your username and password." };

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.username, parsed.data.username)).limit(1);
  if (!user || user.disabled || !checkPassword(parsed.data.password, user.passwordHash)) {
    fails.set(ip, { n: f.n + 1, t: Date.now() });
    return { error: "Wrong username or password." };
  }
  fails.delete(ip);
  const { token } = await createSession(db, user.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
    secure: process.env.COOKIE_SECURE === "true",
  });
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  const jar = await cookies();
  await deleteSession(await getDb(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePassword(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const actor = await getActor();
  if (!actor.userId) return { error: "Sign in again." };
  const parsed = z
    .object({ current: z.string().min(1, "Enter your current password"), next: z.string().min(8, "Use at least 8 characters").max(200) })
    .safeParse({ current: form.get("current"), next: form.get("next") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, actor.userId)).limit(1);
  if (!checkPassword(parsed.data.current, user?.passwordHash)) return { error: "Your current password is wrong." };
  await db.update(users).set({ passwordHash: hashPassword(parsed.data.next) }).where(eq(users.id, actor.userId));
  return { ok: true };
}
