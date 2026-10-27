import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { SESSION_COOKIE, userForToken } from "@/server/auth/session";
import type { Actor, Role } from "@/server/permissions";
import { atLeast } from "@/server/permissions";
import { getDefaultWorkspace, roleIn } from "@/server/services/workspace";
import { actorForApiKey } from "@/server/services/apikeys";

/** The signed-in user (or a public actor), resolved once per request. Never trust anything from the client. */
export const getActor = cache(async (): Promise<Actor> => {
  // Read the request first: nothing time- or random-dependent may run before it during prerendering.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const bearer = (await headers()).get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  // Sessions expire against the current time and SOP data changes constantly: always render per request.
  await connection();
  const db = await getDb();
  if (bearer) {
    // API keys (REST API, browser extension). An invalid key is anonymous, never a fallback to the cookie.
    const keyActor = await actorForApiKey(db, bearer);
    if (keyActor) return keyActor;
    const ws = await getDefaultWorkspace(db);
    return { userId: null, name: "Guest", username: null, role: "public", workspaceId: ws!.id };
  }
  const ws = await getDefaultWorkspace(db);
  if (!ws) throw new Error("Workspace missing; bootstrap did not run.");
  const user = await userForToken(db, token);
  if (!user) return { userId: null, name: "Guest", username: null, role: "public", workspaceId: ws.id };
  const role = await roleIn(db, ws.id, user.id);
  return { userId: user.id, name: user.name, username: user.username, role: role ?? "public", workspaceId: ws.id };
});

/** For pages: send signed-out (or under-privileged) people to sign in. */
export async function requireRole(role: Exclude<Role, "public">, from?: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor.userId) {
    const next = from ?? (await headers()).get("x-hcc-path") ?? "/sops";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (!atLeast(actor, role)) redirect("/sops?denied=1");
  return actor;
}

/** Request-scoped database + actor, in the order Cache Components needs (request data first). */
export async function getContext() {
  const actor = await getActor();
  const db = await getDb();
  return { db, actor };
}
