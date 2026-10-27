import type { Executor } from "@/db";
import { auditEvents } from "@/db/schema";
import type { Actor } from "@/server/permissions";

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
  | "workspace.branding_updated";

export async function audit(
  db: Executor,
  actor: Actor,
  action: AuditAction,
  target: { type: "sop" | "folder" | "version" | "snippet" | "workspace"; id: string },
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
