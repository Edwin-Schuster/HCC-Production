import { and, desc, eq, like, lt, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { auditEvents, folders, snippets, sops, users } from "@/db/schema";
import { forbidden } from "@/server/errors";
import { atLeast, type Actor } from "@/server/permissions";

export type AuditAction =
  | "sop.created"
  | "sop.published"
  | "sop.metadata_updated"
  | "sop.retired"
  | "sop.restored"
  | "sop.deleted"
  | "sop.draft_discarded"
  | "folder.created"
  | "folder.updated"
  | "folder.deleted"
  | "sop.snippet_updated"
  | "sop.review_requested"
  | "sop.approved"
  | "sop.changes_requested"
  | "sop.reviewed"
  | "sop.rolled_back"
  | "sop.suggestion_accepted"
  | "sop.imported"
  | "snippet.created"
  | "snippet.updated"
  | "snippet.deleted"
  | "workspace.branding_updated"
  | "sop.shared"
  | "sop.share_revoked"
  | "apikey.created"
  | "apikey.revoked"
  | "webhook.created"
  | "webhook.deleted";

export async function audit(
  db: Executor,
  actor: Actor,
  action: AuditAction,
  target: { type: "sop" | "folder" | "version" | "snippet" | "workspace" | "apikey" | "webhook"; id: string },
  metadata: Record<string, unknown> = {},
) {
  await db.insert(auditEvents).values({
    workspaceId: actor.workspaceId,
    actorId: actor.userId,
    action,
    targetType: target.type,
    targetId: target.id,
    metadata,
  });
}

export type AuditItem = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  actorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

/** The audit trail, newest first. Admins see everything; editors can read one SOP's trail. */
export async function listAudit(
  db: Executor,
  actor: Actor,
  opts: { targetId?: string; action?: string; actorId?: string; before?: string; limit?: number } = {},
): Promise<{ items: AuditItem[]; next: string | null }> {
  if (!atLeast(actor, opts.targetId ? "editor" : "admin")) throw forbidden("Only admins can see the audit log.");
  const limit = Math.min(opts.limit ?? 50, 200);
  const label = sql<string | null>`case ${auditEvents.targetType}
    when 'sop' then (select document_code || ' · ' || title from ${sops} where ${sops.id} = ${auditEvents.targetId})
    when 'folder' then (select name from ${folders} where ${folders.id} = ${auditEvents.targetId})
    when 'snippet' then (select name from ${snippets} where ${snippets.id} = ${auditEvents.targetId})
    else null end`;
  const rows = await db
    .select({ e: auditEvents, actorName: users.name, label })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .where(
      and(
        eq(auditEvents.workspaceId, actor.workspaceId),
        opts.targetId ? eq(auditEvents.targetId, opts.targetId) : undefined,
        opts.action ? like(auditEvents.action, `${opts.action.replace(/[%_]/g, "")}%`) : undefined,
        opts.actorId ? eq(auditEvents.actorId, opts.actorId) : undefined,
        opts.before ? lt(auditEvents.createdAt, new Date(opts.before)) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map(({ e, actorName, label }) => ({
    id: e.id,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    targetLabel: label,
    actorName,
    metadata: e.metadata as Record<string, unknown>,
    createdAt: e.createdAt.toISOString(),
  }));
  return { items, next: rows.length > limit ? items[items.length - 1].createdAt : null };
}
