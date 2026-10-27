import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { toPublicError } from "@/server/errors";
import { MAX_IMPORT_BYTES } from "@/server/import";
import { previewImport } from "@/server/services/imports";

/** Converts an uploaded document into blocks for the import preview. Multipart, one "file" field. */
export async function POST(req: NextRequest) {
  try {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_IMPORT_BYTES + 64 * 1024) return NextResponse.json({ error: "Files can be at most 30 MB." }, { status: 413 });
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a file in the “file” field." }, { status: 400 });
    const { db, actor } = await getContext();
    return NextResponse.json(await previewImport(db, actor, file.name, new Uint8Array(await file.arrayBuffer())));
  } catch (e) {
    const p = toPublicError(e);
    return NextResponse.json({ error: p.message }, { status: p.status });
  }
}
