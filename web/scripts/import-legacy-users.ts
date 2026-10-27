/**
 * Copies users from the legacy HCC app (SQLite, data/hcc.db) into this app.
 * Password hashes use the same scrypt format, so everyone signs in with their existing password.
 *
 *   npm run import:legacy-users -- /path/to/hcc.db
 *
 * Safe to re-run: existing usernames are left alone (their role is not changed).
 */
import { DatabaseSync } from "node:sqlite";
import { eq } from "drizzle-orm";
import { createDb } from "@/db";
import { users, workspaceMembers } from "@/db/schema";
import { bootstrap } from "@/server/bootstrap";

type LegacyUser = { username: string; name: string | null; email: string | null; role: string; password_hash: string | null };

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run import:legacy-users -- /path/to/hcc.db");
  const legacy = new DatabaseSync(file, { readOnly: true });
  const rows = legacy.prepare("SELECT username, name, email, role, password_hash FROM users").all() as LegacyUser[];
  legacy.close();

  const { db, close } = await createDb();
  // Import before bootstrap would create a first admin, so a fresh install doesn't get an extra account.
  const ws = await db.transaction(async (tx) => {
    const { DEFAULT_WORKSPACE_SLUG } = await import("@/server/services/workspace");
    const { workspaces } = await import("@/db/schema");
    let [w] = await tx.select().from(workspaces).where(eq(workspaces.slug, DEFAULT_WORKSPACE_SLUG)).limit(1);
    if (!w) [w] = await tx.insert(workspaces).values({ name: process.env.ORG_NAME ?? "Hope Christian Church", slug: DEFAULT_WORKSPACE_SLUG }).returning();

    let added = 0;
    for (const r of rows) {
      const username = r.username.toLowerCase();
      const [exists] = await tx.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
      if (exists) {
        console.log(`  skip  ${username} (already exists)`);
        continue;
      }
      const hash = r.password_hash?.startsWith("scrypt:") ? r.password_hash : null;
      const [u] = await tx.insert(users).values({ username, name: r.name || username, email: r.email || null, passwordHash: hash }).returning();
      const role = r.role === "admin" || r.role === "editor" ? r.role : "viewer";
      await tx.insert(workspaceMembers).values({ workspaceId: w.id, userId: u.id, role });
      console.log(`  add   ${username} as ${role}${hash ? "" : " (no password, set one in People)"}`);
      added++;
    }
    console.log(`Imported ${added} of ${rows.length} users.`);
    return w;
  });
  await bootstrap(db, { quiet: true });
  console.log(`Workspace: ${ws.name}`);
  await close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
