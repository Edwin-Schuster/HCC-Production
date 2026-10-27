import { and, eq } from "drizzle-orm";
import { z } from "zod";
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

/** An attached file (uploaded here) or a link to one elsewhere. */
export const AttachmentSchema = z.object({
  url: z
    .string()
    .max(2_000)
    .refine((u) => /^(https?:\/\/|\/files\/[0-9a-f-]{36}$)/i.test(u), "Attach an uploaded file or an http(s) link"),
  name: z.string().trim().min(1).max(200),
  size: z.number().int().min(0).optional(),
  mime: z.string().max(100).optional(),
  external: z.boolean().optional(),
});
export const Attachments = z.array(AttachmentSchema).max(50);

export const MAX_ATTACHMENT_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;

/** Types a browser may show inline. Anything else downloads, so an uploaded HTML file can't run in the app's origin. */
const INLINE = new Set<string>([...IMAGE_TYPES, ...VIDEO_TYPES, "application/pdf", "text/plain"]);
export const servesInline = (mime: string) => INLINE.has(mime);

/** Looks like text: valid UTF-8 with no NUL bytes in the first 8 KB (show files, exported configs, CSV). */
function looksText(b: Uint8Array) {
  const head = b.subarray(0, 8192);
  if (head.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head.length === b.length ? head : head.subarray(0, Math.max(0, head.length - 4)));
    return true;
  } catch {
    return false;
  }
}

export function sniffAttachment(b: Uint8Array): string {
  const media = sniffImage(b) ?? sniffVideo(b);
  if (media) return media;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  return b.length && looksText(b) ? "text/plain" : "application/octet-stream";
}

/** Any file for project work. Private: only editors in the workspace can download it. */
export async function uploadAttachment(db: Executor, actor: Actor, name: string, bytes: Uint8Array) {
  if (!atLeast(actor, "editor")) throw forbidden("Only editors can upload files.");
  if (!bytes.byteLength) throw invalid("That file is empty.");
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw invalid(`Files can be at most ${MAX_ATTACHMENT_BYTES / 1048576} MB.`);
  const mime = sniffAttachment(bytes);
  const id = crypto.randomUUID();
  const storageKey = `${actor.workspaceId}/${id}`;
  await storage().put(storageKey, bytes);
  const fileName = name.replace(/[\/\0]/g, "_").slice(0, 200) || "file";
  await db.insert(files).values({ id, workspaceId: actor.workspaceId, name: fileName, mime, size: bytes.byteLength, storageKey, private: true, createdBy: actor.userId });
  return { id, url: `/files/${id}`, name: fileName, mime, size: bytes.byteLength };
}

/** Reads a stored file as text (config backup viewer). Editors only. */
export async function readTextFile(db: Executor, actor: Actor, id: string, maxBytes = 2 * 1024 * 1024) {
  if (!atLeast(actor, "editor")) throw forbidden();
  const [row] = await db.select().from(files).where(and(eq(files.id, id), eq(files.workspaceId, actor.workspaceId))).limit(1);
  if (!row) throw notFound("File not found.");
  if (row.mime !== "text/plain") throw invalid("That file isn't text.");
  const body = await storage().get(row.storageKey, row.size > maxBytes ? { start: 0, end: maxBytes - 1 } : undefined);
  if (!body) throw notFound("File not found.");
  const chunks: Uint8Array[] = [];
  const reader = body.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return { name: row.name, size: row.size, truncated: row.size > maxBytes, text: new TextDecoder().decode(Buffer.concat(chunks)) };
}

/**
 * SOP images are served by unguessable id, so images in public SOPs work for signed-out readers
 * (the same model as the original app). Ids are random UUIDs and never listed.
 */
export class RangeNotSatisfiable extends Error {}

/** `range` comes from an HTTP Range header; a negative start means "the last N bytes". */
export async function openFile(db: Executor, id: string, range?: { start: number; end: number }, actor?: () => Promise<Actor>) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound();
  const [row] = await db.select().from(files).where(and(eq(files.id, id))).limit(1);
  if (!row) throw notFound();
  if (row.private) {
    const a = actor ? await actor() : null;
    if (!a || a.workspaceId !== row.workspaceId || !atLeast(a, "editor")) throw notFound();
  }
  let resolved: { start: number; end: number } | undefined;
  if (range) {
    resolved = range.start < 0 ? { start: Math.max(0, row.size + range.start), end: row.size - 1 } : { start: range.start, end: Math.min(range.end, row.size - 1) };
    if (resolved.start >= row.size || resolved.end < resolved.start) throw new RangeNotSatisfiable();
  }
  const body = await storage().get(row.storageKey, resolved);
  if (!body) throw notFound();
  return { ...row, ...body, range: resolved };
}
