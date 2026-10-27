import type { CSSProperties } from "react";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { workspaces, type Branding } from "@/db/schema";
import { forbidden } from "@/server/errors";
import { atLeast, type Actor } from "@/server/permissions";
import { audit } from "./audit";

/** Workspace branding, inherited by every SOP's reading view and PDF. */
export const BrandingInput = z.object({
  logoUrl: z
    .string()
    .trim()
    .max(2_000)
    .regex(/^(\/files\/[0-9a-f-]{36}|https:\/\/\S+)?$/i, "Upload a logo or use an https:// link")
    .nullable()
    .default(null)
    .transform((v) => v || null),
  primaryColor: z
    .string()
    .trim()
    .regex(/^(#[0-9a-f]{6})?$/i, "Use a hex colour like #3b82f6")
    .nullable()
    .default(null)
    .transform((v) => v || null),
  font: z.enum(["default", "serif", "system"]).default("default"),
  headerText: z.string().trim().max(120).default(""),
  footerText: z.string().trim().max(200).default(""),
});

export async function getBranding(db: Executor, workspaceId: string): Promise<Branding> {
  const [w] = await db.select({ branding: workspaces.branding }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return w?.branding ?? {};
}

export async function updateBranding(db: Executor, actor: Actor, input: z.input<typeof BrandingInput>) {
  if (!atLeast(actor, "admin")) throw forbidden("Only admins can change branding.");
  const branding = BrandingInput.parse(input);
  await db.update(workspaces).set({ branding }).where(eq(workspaces.id, actor.workspaceId));
  await audit(db, actor, "workspace.branding_updated", { type: "workspace", id: actor.workspaceId }, { branding });
  return branding;
}

/** Inline style and data attribute that scope branding to an SOP document (see globals.css). */
export function brandScope(b: Branding): { style: CSSProperties; "data-brand"?: string; "data-brand-font"?: string } {
  const style = (b.primaryColor ? { "--brand": b.primaryColor } : {}) as CSSProperties;
  return { style, ...(b.primaryColor ? { "data-brand": "" } : {}), ...(b.font && b.font !== "default" ? { "data-brand-font": b.font } : {}) };
}
