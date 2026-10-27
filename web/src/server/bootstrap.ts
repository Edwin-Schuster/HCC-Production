import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { folders, sops, teamRoles, templates, users, workspaceMembers, workspaces } from "@/db/schema";
import { hashPassword } from "@/server/auth/password";
import { BUILT_IN_TEMPLATES } from "@/server/templates";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/services/workspace";

/** First-run setup: workspace, built-in templates, first admin and (optionally) demo content. Safe to run on every start. */
export async function bootstrap(db: DB, opts: { seedDemo?: boolean; quiet?: boolean } = {}) {
  const seedDemo = opts.seedDemo ?? process.env.SEED_DEMO !== "false";
  let [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, DEFAULT_WORKSPACE_SLUG)).limit(1);
  if (!ws) [ws] = await db.insert(workspaces).values({ name: process.env.ORG_NAME ?? "Hope Christian Church", slug: DEFAULT_WORKSPACE_SLUG }).returning();

  const existing = new Set((await db.select({ key: templates.key }).from(templates).where(eq(templates.workspaceId, ws.id))).map((t) => t.key));
  const missing = BUILT_IN_TEMPLATES.map((t, position) => ({ ...t, position })).filter((t) => !existing.has(t.key));
  if (missing.length) {
    await db.insert(templates).values(missing.map((t) => ({ workspaceId: ws.id, key: t.key, name: t.name, description: t.description, blocks: t.build(), position: t.position })));
  }

  const [{ n: userCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  if (!userCount) {
    const username = (process.env.ADMIN_USER ?? "admin").toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(9).toString("base64url");
    const [admin] = await db
      .insert(users)
      .values({ username, name: process.env.ADMIN_NAME ?? "Administrator", email: process.env.ADMIN_EMAIL || null, passwordHash: hashPassword(password) })
      .returning();
    await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: admin.id, role: "admin" });
    if (!opts.quiet) {
      console.log("\n==============================================");
      console.log(` First run: created admin user "${username}"`);
      if (!process.env.ADMIN_PASSWORD) console.log(` Generated password: ${password}`);
      console.log("==============================================\n");
    }
  }

  const [{ n: folderCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(folders).where(eq(folders.workspaceId, ws.id));
  const [{ n: sopCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(sops).where(eq(sops.workspaceId, ws.id));
  if (seedDemo && !sopCount && !folderCount) {
    const { seedDemoContent } = await import("./seed");
    await db.transaction((tx) => seedDemoContent(tx, ws.id));
  } else if (!folderCount) {
    await db.insert(folders).values({ workspaceId: ws.id, name: "General", codePrefix: "GEN", visibility: "members" });
  }
  const [{ n: roleCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(teamRoles).where(eq(teamRoles.workspaceId, ws.id));
  if (!roleCount) {
    await db.insert(teamRoles).values(DEFAULT_TEAM_ROLES.map((name) => ({ workspaceId: ws.id, name })));
  }
  return ws;
}

export const DEFAULT_TEAM_ROLES = ["Technical Director", "Audio Engineer (A1)", "Video Director", "Camera Operator", "ProPresenter / Lyrics", "Lighting", "Stream Tech"];
