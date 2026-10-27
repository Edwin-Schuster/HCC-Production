import { and, eq } from "drizzle-orm";
import type { Executor } from "@/db";
import { files } from "@/db/schema";
import { forbidden, invalid, notFound } from "@/server/errors";
import { atLeast, type Actor } from "@/server/permissions";
import { storage } from "@/server/storage";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export const MAX_IMAGE_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;

/** Sniff the real type from the first bytes; never trust the browser's Content-Type. */
export function sniffImage(bytes: Uint8Array): (typeof IMAGE_TYPES)[number] | null {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export async function uploadImage(db: Executor, actor: Actor, name: string, bytes: Uint8Array) {
  if (!atLeast(actor, "editor")) throw forbidden("Only editors can upload files.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw invalid(`Images can be at most ${MAX_IMAGE_BYTES / 1048576} MB.`);
  const mime = sniffImage(bytes);
  if (!mime) throw invalid("Upload a PNG, JPEG, GIF or WebP image.");
  const id = crypto.randomUUID();
  const storageKey = `${actor.workspaceId}/${id}`;
  await storage().put(storageKey, bytes);
  await db.insert(files).values({ id, workspaceId: actor.workspaceId, name: name.slice(0, 200) || "image", mime, size: bytes.byteLength, storageKey, createdBy: actor.userId });
  return { id, url: `/files/${id}`, mime, size: bytes.byteLength };
}

/**
 * SOP images are served by unguessable id, so images in public SOPs work for signed-out readers
 * (the same model as the original app). Ids are random UUIDs and never listed.
 */
export async function openFile(db: Executor, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound();
  const [row] = await db.select().from(files).where(and(eq(files.id, id))).limit(1);
  if (!row) throw notFound();
  const body = await storage().get(row.storageKey);
  if (!body) throw notFound();
  return { ...row, ...body };
}
