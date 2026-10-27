import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { shareLinks, sopVersions, users } from "@/db/schema";
import { checkPassword, hashPassword } from "@/server/auth/password";
import { forbidden, invalid, notFound } from "@/server/errors";
import { canEditSop, type Actor } from "@/server/permissions";
import { recordAnonymousView } from "./analytics";
import { audit } from "./audit";
import { getSopDocument, loadSop } from "./sops";

/**
 * Share links open one SOP without signing in. They show the current published version (or a pinned one),
 * never drafts, and never SOPs in editors-only folders.
 */

export const ShareInput = z.object({
  label: z.string().trim().max(120).default(""),
  password: z.string().max(200).default(""),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
  pinVersion: z.boolean().default(false),
});

export async function createShareLink(db: Executor, actor: Actor, sopId: string, input: z.input<typeof ShareInput>) {
  const data = ShareInput.parse(input);
  const { sop, visibility } = await loadSop(db, actor, sopId);
  if (!canEditSop(actor, sop, visibility)) throw forbidden("Only editors can share SOPs.");
  if (!sop.currentVersionId) throw invalid("Publish the SOP before sharing it.");
  if (visibility === "editors") throw invalid("SOPs in editors-only folders can't be shared outside the team.");
  if (data.password && data.password.length < 6) throw invalid("Use a password of at least 6 characters.");
  const token = crypto.randomBytes(18).toString("base64url");
  const [row] = await db
    .insert(shareLinks)
    .values({
      workspaceId: actor.workspaceId,
      sopId,
      token,
      label: data.label,
      passwordHash: data.password ? hashPassword(data.password) : null,
      versionId: data.pinVersion ? sop.currentVersionId : null,
      expiresAt: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 864e5) : null,
      createdBy: actor.userId,
    })
    .returning();
  await audit(db, actor, "sop.shared", { type: "sop", id: sopId }, { shareId: row.id, label: data.label, password: Boolean(data.password), expiresAt: row.expiresAt?.toISOString() ?? null, pinned: data.pinVersion });
  return { id: row.id, token };
}

export type ShareLinkView = {
  id: string;
  token: string;
  label: string;
  hasPassword: boolean;
  versionNumber: number | null;
  expiresAt: string | null;
  expired: boolean;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdByName: string | null;
  createdAt: string;
};

export async function listShareLinks(db: Executor, actor: Actor, sopId: string): Promise<ShareLinkView[]> {
  const { sop, visibility } = await loadSop(db, actor, sopId);
  if (!canEditSop(actor, sop, visibility)) return [];
  const version = sql<number | null>`(select version_number from ${sopVersions} v where v.id = ${shareLinks.versionId})`;
  const rows = await db
    .select({ s: shareLinks, by: users.name, version })
    .from(shareLinks)
    .leftJoin(users, eq(users.id, shareLinks.createdBy))
    .where(eq(shareLinks.sopId, sopId))
    .orderBy(desc(shareLinks.createdAt));
  const now = Date.now();
  return rows.map(({ s, by, version }) => ({
    id: s.id,
    token: s.token,
    label: s.label,
    hasPassword: Boolean(s.passwordHash),
    versionNumber: version,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    expired: Boolean(s.expiresAt && s.expiresAt.getTime() < now),
    revokedAt: s.revokedAt?.toISOString() ?? null,
    viewCount: s.viewCount,
    lastViewedAt: s.lastViewedAt?.toISOString() ?? null,
    createdByName: by,
    createdAt: s.createdAt.toISOString(),
  }));
}

export async function revokeShareLink(db: Executor, actor: Actor, shareId: string) {
  const [s] = await db.select().from(shareLinks).where(and(eq(shareLinks.id, shareId), eq(shareLinks.workspaceId, actor.workspaceId))).limit(1);
  if (!s) throw notFound("Share link not found.");
  const { sop, visibility } = await loadSop(db, actor, s.sopId);
  if (!canEditSop(actor, sop, visibility)) throw forbidden("Only editors can revoke share links.");
  await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, s.id));
  await audit(db, actor, "sop.share_revoked", { type: "sop", id: s.sopId }, { shareId: s.id, label: s.label });
}

/** Proof that this browser entered the right password: tied to the link and its password, so changing either invalidates it. */
export function unlockToken(share: { token: string; passwordHash: string | null }) {
  return crypto.createHash("sha256").update(`${share.token}:${share.passwordHash}`).digest("base64url");
}

export type ShareState = { status: "missing" } | { status: "locked"; label: string } | { status: "ok"; doc: Awaited<ReturnType<typeof getSopDocument>> };

/** Opens a share link. `unlock` is the cookie set after the password was entered. */
export async function openShare(db: Executor, token: string, unlock: string | undefined, opts: { count?: boolean } = {}): Promise<ShareState> {
  if (!/^[\w-]{20,40}$/.test(token)) return { status: "missing" };
  const [s] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  if (!s || s.revokedAt || (s.expiresAt && s.expiresAt < new Date())) return { status: "missing" };
  if (s.passwordHash && unlock !== unlockToken(s)) return { status: "locked", label: s.label };
  // Read as a signed-in team member would: published, non-retired SOPs in non-editor folders only.
  const reader: Actor = { userId: null, name: "Shared link", username: null, role: "viewer", workspaceId: s.workspaceId };
  let doc;
  try {
    const pinned = s.versionId ? (await db.select({ number: sopVersions.versionNumber }).from(sopVersions).where(eq(sopVersions.id, s.versionId)))[0]?.number : undefined;
    doc = await getSopDocument(db, reader, s.sopId, pinned ?? undefined);
  } catch {
    return { status: "missing" };
  }
  if (doc.version.isDraft) return { status: "missing" };
  if (opts.count) {
    await db.update(shareLinks).set({ viewCount: sql`${shareLinks.viewCount} + 1`, lastViewedAt: new Date() }).where(eq(shareLinks.id, s.id));
    await recordAnonymousView(db, s.workspaceId, s.sopId, doc.version.id, "share");
  }
  return { status: "ok", doc: { ...doc, canEdit: false, canManage: false } };
}

/** Checks a password for a share link; returns the unlock cookie value, or null. */
export async function unlockShare(db: Executor, token: string, password: string): Promise<string | null> {
  const [s] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  if (!s || s.revokedAt || (s.expiresAt && s.expiresAt < new Date()) || !s.passwordHash) return null;
  return checkPassword(password, s.passwordHash) ? unlockToken(s) : null;
}
