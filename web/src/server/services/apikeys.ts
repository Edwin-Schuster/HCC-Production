import crypto from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { apiKeys, users, workspaceMembers } from "@/db/schema";
import { forbidden, invalid, notFound } from "@/server/errors";
import { atLeast, type Actor, type Role } from "@/server/permissions";
import { audit } from "./audit";

/**
 * Personal API keys ("hcc_…"). A key acts as the person who made it, but never above the key's own role,
 * and stops working when it's revoked, expires, or the person loses access. Only a hash is stored.
 */

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export const ApiKeyInput = z.object({
  name: z.string().trim().min(1, "Name the key, e.g. “Browser extension”").max(80),
  role: z.enum(["viewer", "editor"]).default("viewer"),
  expiresInDays: z.number().int().min(1).max(730).nullable().default(null),
});

export async function createApiKey(db: Executor, actor: Actor, input: z.input<typeof ApiKeyInput>) {
  if (!actor.userId || !atLeast(actor, "viewer")) throw forbidden("Sign in to create API keys.");
  const data = ApiKeyInput.parse(input);
  if (data.role === "editor" && !atLeast(actor, "editor")) throw forbidden("Only editors can create keys that change SOPs.");
  const token = `hcc_${crypto.randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({ workspaceId: actor.workspaceId, userId: actor.userId, name: data.name, prefix: token.slice(0, 10), keyHash: sha256(token), role: data.role, expiresAt: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 864e5) : null })
    .returning();
  await audit(db, actor, "apikey.created", { type: "apikey", id: row.id }, { name: data.name, role: data.role });
  return { id: row.id, token };
}

export type ApiKeyView = { id: string; name: string; prefix: string; role: "viewer" | "editor"; ownerName: string; createdAt: string; lastUsedAt: string | null; expiresAt: string | null; revoked: boolean };

/** Your own keys; admins see everyone's so they can revoke them. */
export async function listApiKeys(db: Executor, actor: Actor, opts: { mine?: boolean } = {}): Promise<ApiKeyView[]> {
  if (!actor.userId) return [];
  const rows = await db
    .select({ k: apiKeys, ownerName: users.name })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(and(eq(apiKeys.workspaceId, actor.workspaceId), atLeast(actor, "admin") && !opts.mine ? undefined : eq(apiKeys.userId, actor.userId)))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map(({ k, ownerName }) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    role: k.role,
    ownerName,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    revoked: Boolean(k.revokedAt),
  }));
}

export async function revokeApiKey(db: Executor, actor: Actor, id: string) {
  const [k] = await db.select().from(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, actor.workspaceId))).limit(1);
  if (!k) throw notFound("API key not found.");
  if (k.userId !== actor.userId && !atLeast(actor, "admin")) throw forbidden("You can only revoke your own keys.");
  if (k.revokedAt) throw invalid("This key is already revoked.");
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, k.id));
  await audit(db, actor, "apikey.revoked", { type: "apikey", id: k.id }, { name: k.name });
}

const RANK: Record<Exclude<Role, "public">, number> = { viewer: 1, editor: 2, admin: 3 };

/** Resolves a bearer token to the acting user and their capped role, or null. */
export async function actorForApiKey(db: Executor, token: string): Promise<{ userId: string; name: string; username: string; role: Exclude<Role, "public">; workspaceId: string } | null> {
  if (!/^hcc_[\w-]{20,60}$/.test(token)) return null;
  const [row] = await db
    .select({ k: apiKeys, user: users, memberRole: workspaceMembers.role })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .innerJoin(workspaceMembers, and(eq(workspaceMembers.userId, apiKeys.userId), eq(workspaceMembers.workspaceId, apiKeys.workspaceId)))
    .where(and(eq(apiKeys.keyHash, sha256(token)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row || row.user.disabled || (row.k.expiresAt && row.k.expiresAt < new Date())) return null;
  // Record use at most once a minute.
  if (!row.k.lastUsedAt || Date.now() - row.k.lastUsedAt.getTime() > 60_000) await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.k.id));
  const role = RANK[row.memberRole] < RANK[row.k.role] ? row.memberRole : row.k.role;
  return { userId: row.user.id, name: row.user.name, username: row.user.username, role, workspaceId: row.k.workspaceId };
}
