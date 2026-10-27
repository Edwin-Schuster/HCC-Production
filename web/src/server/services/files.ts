import { and, eq } from "drizzle-orm";
import type { Executor } from "@/db";
import { files } from "@/db/schema";
import { forbidden, invalid, notFound } from "@/server/errors";
import { atLeast, type Actor } from "@/server/permissions";
import { storage } from "@/server/storage";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const MAX_IMAGE_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;
export const MAX_VIDEO_BYTES = Number(process.env.MAX_VIDEO_MB ?? 250) * 1024 * 1024;

/** Sniff the real type from the first bytes; never trust the browser's Content-Type. */
export function sniffImage(bytes: Uint8Array): (typeof IMAGE_TYPES)[number] | null {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export function sniffVideo(b: Uint8Array): (typeof VIDEO_TYPES)[number] | null {
  // ISO base media ("....ftyp") is MP4/MOV; EBML header is WebM/Matroska.
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "video/mp4";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  return null;
}

/** Images and videos for SOPs. The type comes from the file's bytes. */
export async function uploadImage(db: Executor, actor: Actor, name: string, bytes: Uint8Array) {
  if (!atLeast(actor, "editor")) throw forbidden("Only editors can upload files.");
  const image = sniffImage(bytes);
  const video = image ? null : sniffVideo(bytes);
  if (!image && !video) throw invalid("Upload a PNG, JPEG, GIF or WebP image, or an MP4 or WebM video.");
  if (image && bytes.byteLength > MAX_IMAGE_BYTES) throw invalid(`Images can be at most ${MAX_IMAGE_BYTES / 1048576} MB.`);
  if (video && bytes.byteLength > MAX_VIDEO_BYTES) throw invalid(`Videos can be at most ${MAX_VIDEO_BYTES / 1048576} MB.`);
  const mime = (image ?? video)!;
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
export class RangeNotSatisfiable extends Error {}

/** `range` comes from an HTTP Range header; a negative start means "the last N bytes". */
export async function openFile(db: Executor, id: string, range?: { start: number; end: number }) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound();
  const [row] = await db.select().from(files).where(and(eq(files.id, id))).limit(1);
  if (!row) throw notFound();
  let resolved: { start: number; end: number } | undefined;
  if (range) {
    resolved = range.start < 0 ? { start: Math.max(0, row.size + range.start), end: row.size - 1 } : { start: range.start, end: Math.min(range.end, row.size - 1) };
    if (resolved.start >= row.size || resolved.end < resolved.start) throw new RangeNotSatisfiable();
  }
  const body = await storage().get(row.storageKey, resolved);
  if (!body) throw notFound();
  return { ...row, ...body, range: resolved };
}
