import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { workspaces, type WorkspaceSettings } from "@/db/schema";
import { forbidden } from "@/server/errors";
import { atLeast, type Actor } from "@/server/permissions";

const requireAdmin = (actor: Actor) => {
  if (!atLeast(actor, "admin")) throw forbidden("Only admins can change workspace settings.");
};

const Url = z
  .string()
  .trim()
  .max(300)
  .refine((u) => !u || /^https?:\/\/[^\s/]+/i.test(u), "Use a full http(s) address")
  .transform((u) => u.replace(/\/+$/, ""));

export const SettingsInput = z.object({
  reminderHours: z.number().int().min(1, "At least an hour").max(336, "At most two weeks"),
  appUrl: Url,
  ntfyServer: Url,
});

export async function getSettings(db: Executor, actor: Actor): Promise<WorkspaceSettings> {
  requireAdmin(actor);
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, actor.workspaceId)).limit(1);
  return ws?.settings ?? {};
}

/** Merges into the stored settings, so fields owned elsewhere (the calendar token) are kept. */
export async function updateSettings(db: Executor, actor: Actor, input: z.input<typeof SettingsInput>) {
  requireAdmin(actor);
  const data = SettingsInput.parse(input);
  await db
    .update(workspaces)
    .set({ settings: sql`coalesce(${workspaces.settings}, '{}'::jsonb) || ${JSON.stringify(data)}::jsonb` })
    .where(eq(workspaces.id, actor.workspaceId));
}
