import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { projectPhotos, users } from "@/db/schema";
import { invalid, notFound } from "@/server/errors";
import type { Actor } from "@/server/permissions";
import { logActivity } from "./activity";
import { loadProject, requireEditor } from "./projects";

/** Site photos and videos for a project, browsed by location. Editors only. */

export type Photo = { id: string; projectId: string; url: string; caption: string; location: string; mime: string; takenByName: string | null; createdAt: string };

const FileUrl = z.string().regex(/^\/files\/[0-9a-f-]{36}$/, "Upload the photo first");
export const PhotoInput = z.object({
  files: z.array(z.object({ url: FileUrl, mime: z.string().max(100).regex(/^(image|video)\//, "Photos and videos only") })).min(1).max(30),
  location: z.string().trim().max(120).default(""),
  caption: z.string().trim().max(300).default(""),
});

export async function listPhotos(db: Executor, actor: Actor, projectId: string): Promise<Photo[]> {
  await loadProject(db, actor, projectId);
  const rows = await db
    .select({ p: projectPhotos, takenByName: users.name })
    .from(projectPhotos)
    .leftJoin(users, eq(users.id, projectPhotos.takenBy))
    .where(eq(projectPhotos.projectId, projectId))
    .orderBy(desc(projectPhotos.createdAt));
  return rows.map(({ p, takenByName }) => ({ id: p.id, projectId: p.projectId, url: p.url, caption: p.caption, location: p.location, mime: p.mime, takenByName, createdAt: p.createdAt.toISOString() }));
}

export async function addPhotos(db: Executor, actor: Actor, projectId: string, input: z.input<typeof PhotoInput>) {
  const project = await loadProject(db, actor, projectId);
  const data = PhotoInput.parse(input);
  await db.insert(projectPhotos).values(data.files.map((f) => ({ workspaceId: actor.workspaceId, projectId: project.id, url: f.url, mime: f.mime, caption: data.caption, location: data.location, takenBy: actor.userId })));
  const n = data.files.length;
  await logActivity(db, actor, { projectId: project.id, targetType: "project", targetId: project.id, targetName: project.name, text: `added ${n} photo${n === 1 ? "" : "s"}${data.location ? ` of ${data.location}` : ""}` });
}

async function loadPhoto(db: Executor, actor: Actor, id: string) {
  requireEditor(actor, "photos");
  const [p] = await db.select().from(projectPhotos).where(and(eq(projectPhotos.id, id), eq(projectPhotos.workspaceId, actor.workspaceId))).limit(1);
  if (!p) throw notFound("Photo not found.");
  return p;
}

export const PhotoEdit = z.object({ caption: z.string().trim().max(300), location: z.string().trim().max(120) });

export async function updatePhoto(db: Executor, actor: Actor, id: string, input: z.input<typeof PhotoEdit>) {
  await loadPhoto(db, actor, id);
  await db.update(projectPhotos).set(PhotoEdit.parse(input)).where(eq(projectPhotos.id, id));
}

export async function deletePhoto(db: Executor, actor: Actor, id: string) {
  const p = await loadPhoto(db, actor, id);
  if (!p) throw invalid("Photo not found.");
  await db.delete(projectPhotos).where(eq(projectPhotos.id, id));
}
