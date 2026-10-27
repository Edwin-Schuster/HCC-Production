/**
 * Every permission decision lives here and runs on the server.
 * Roles: admin > editor > viewer > public (signed out).
 */
export type Role = "public" | "viewer" | "editor" | "admin";
export type Visibility = "public" | "members" | "editors";

export type Actor = {
  userId: string | null;
  name: string;
  username: string | null;
  role: Role;
  workspaceId: string;
};

const RANK: Record<Role, number> = { public: 0, viewer: 1, editor: 2, admin: 3 };
export const atLeast = (actor: Pick<Actor, "role">, role: Role) => RANK[actor.role] >= RANK[role];

export function canViewFolder(actor: Pick<Actor, "role">, visibility: Visibility): boolean {
  if (visibility === "public") return true;
  if (visibility === "members") return atLeast(actor, "viewer");
  return atLeast(actor, "editor");
}

type SopLike = { ownerId: string; status: string; currentVersionId: string | null };

/** Readers see published, non-retired SOPs in folders they can view. Editors also see drafts and retired SOPs. */
export function canReadSop(actor: Actor, sop: SopLike, folderVisibility: Visibility): boolean {
  if (!canViewFolder(actor, folderVisibility)) return false;
  if (atLeast(actor, "editor")) return true;
  return sop.currentVersionId !== null && sop.status !== "retired";
}

export const canReadDrafts = (actor: Actor) => atLeast(actor, "editor");
export const canCreateSop = (actor: Actor) => atLeast(actor, "editor");

export function canEditSop(actor: Actor, sop: SopLike, folderVisibility: Visibility): boolean {
  return atLeast(actor, "editor") && canViewFolder(actor, folderVisibility) && sop.status !== "retired";
}

/** Phase 1: any editor can publish. Phase 2 adds required approvers. */
export const canPublishSop = canEditSop;

/** Ownership, retirement and deletion: the SOP's owner (if editor) or an admin. */
export function canManageSop(actor: Actor, sop: SopLike): boolean {
  if (atLeast(actor, "admin")) return true;
  return atLeast(actor, "editor") && actor.userId === sop.ownerId;
}

export const canManageFolders = (actor: Actor) => atLeast(actor, "admin");
export const canManageMembers = (actor: Actor) => atLeast(actor, "admin");
