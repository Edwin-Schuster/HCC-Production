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
  | "folder.deleted";

export async function audit(
  db: Executor,
  actor: Actor,
  action: AuditAction,
  target: { type: "sop" | "folder" | "version"; id: string },
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
