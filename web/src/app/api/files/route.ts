import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { toPublicError } from "@/server/errors";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, uploadImage } from "@/server/services/files";

/** Image and video upload for the editor: multipart form with a single "file" field. */
export async function POST(req: NextRequest) {
  try {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > Math.max(MAX_IMAGE_BYTES, MAX_VIDEO_BYTES) + 64 * 1024) return NextResponse.json({ error: `Files can be at most ${MAX_VIDEO_BYTES / 1048576} MB.` }, { status: 413 });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach an image in the “file” field." }, { status: 400 });
    const { db, actor } = await getContext();
    const res = await uploadImage(db, actor, file.name, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json(res, { status: 201 });
  } catch (e) {
    const p = toPublicError(e);
    return NextResponse.json({ error: p.message }, { status: p.status });
  }
}
