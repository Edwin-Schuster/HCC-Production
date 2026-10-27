import { eq } from "drizzle-orm";
import { createDb, type DB } from "@/db";
import { folders, users, workspaceMembers } from "@/db/schema";
import { bootstrap } from "@/server/bootstrap";
import type { Actor, Role } from "@/server/permissions";

export async function testDb() {
  const { db, close } = await createDb("pglite://memory");
  const ws = await bootstrap(db, { seedDemo: false, quiet: true });
  const [admin] = await db.select().from(users).limit(1);
  const actorFor = async (role: Exclude<Role, "public">, username: string = role): Promise<Actor> => {
    if (role === "admin") return { userId: admin.id, name: admin.name, username: admin.username, role, workspaceId: ws.id };
    const [u] = await db.insert(users).values({ username, name: username }).returning();
    await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: u.id, role });
    return { userId: u.id, name: u.name, username, role, workspaceId: ws.id };
  };
  const publicActor: Actor = { userId: null, name: "Guest", username: null, role: "public", workspaceId: ws.id };
  const folder = async (name: string, codePrefix: string, visibility: "public" | "members" | "editors" = "members") =>
    (await db.insert(folders).values({ workspaceId: ws.id, name, codePrefix, visibility }).returning())[0];
  const general = (await db.select().from(folders).where(eq(folders.workspaceId, ws.id)))[0];
  return { db: db as DB, close, ws, actorFor, publicActor, folder, general };
}
