import { strFromU8, unzipSync } from "fflate";
import { marked } from "marked";
import { DocumentSchema, type BlockNode } from "@/blocks/schema";
import { invalid } from "@/server/errors";
import { htmlToBlocks, type ImportResult } from "./html-to-blocks";

export const MAX_IMPORT_BYTES = 30 * 1024 * 1024;

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

/** Word (.docx), Google Docs (.docx or zipped web page), HTML or Markdown → blocks, not yet saved anywhere. */
export async function parseImport(name: string, bytes: Uint8Array): Promise<ImportResult> {
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw invalid("Files can be at most 30 MB.");
  const ext = name.toLowerCase().split(".").pop() ?? "";
  let html: string;
  let fallbackTitle = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

  if (isZip(bytes)) {
    const files = unzipSync(bytes);
    if (files["word/document.xml"]) {
      const mammoth = await import("mammoth");
      const res = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
      html = res.value;
    } else {
      // Google Docs "Web page (.html, zipped)": one HTML file plus an images/ folder.
      const htmlName = Object.keys(files).find((f) => f.toLowerCase().endsWith(".html"));
      if (!htmlName) throw invalid("That zip file doesn't contain a document. Upload a .docx, a Google Docs web-page export, an .html or a Markdown file.");
      html = strFromU8(files[htmlName]).replace(/src="([^"]+)"/g, (m, src: string) => {
        const data = files[decodeURIComponent(src)];
        const mime = MIME[src.toLowerCase().split(".").pop() ?? ""];
        return data && mime ? `src="data:${mime};base64,${Buffer.from(data).toString("base64")}"` : m;
      });
      fallbackTitle = htmlName.replace(/\.html$/i, "");
    }
  } else if (ext === "md" || ext === "markdown" || ext === "txt") {
    html = await marked.parse(new TextDecoder().decode(bytes), { gfm: true });
  } else if (ext === "html" || ext === "htm") {
    html = new TextDecoder().decode(bytes);
  } else {
    throw invalid("Upload a Word (.docx), Google Docs (download as .docx or web page), HTML or Markdown file.");
  }

  const res = htmlToBlocks(html, { restartLists: ext === "md" || ext === "markdown" || ext === "txt" });
  return { ...res, title: res.title || fallbackTitle || "Imported SOP" };
}

/** Replaces embedded (data URI) images with uploaded files, then validates the document. */
export async function finalizeImport(blocks: BlockNode[], upload: (bytes: Uint8Array, name: string) => Promise<string>): Promise<{ blocks: BlockNode[]; warnings: string[] }> {
  const warnings: string[] = [];
  let n = 0;
  const visit = async (list: BlockNode[]): Promise<BlockNode[]> => {
    const out: BlockNode[] = [];
    for (const b of list) {
      let next = b;
      if (b.type === "image" && b.content.url.startsWith("data:")) {
        const m = b.content.url.match(/^data:image\/[\w+.-]+;base64,(.+)$/);
        try {
          if (!m) throw new Error("bad data uri");
          const url = await upload(new Uint8Array(Buffer.from(m[1], "base64")), `imported-${++n}`);
          next = { ...b, content: { ...b.content, url } };
        } catch {
          warnings.push("An image couldn't be imported and was left out.");
          continue;
        }
      }
      out.push({ ...next, children: await visit(next.children) } as BlockNode);
    }
    return out;
  };
  const uploaded = await visit(blocks);
  const parsed = DocumentSchema.safeParse(uploaded);
  if (!parsed.success) throw invalid(`The document couldn't be converted: ${parsed.error.issues[0]?.message ?? "invalid content"}.`);
  return { blocks: parsed.data, warnings: [...new Set(warnings)] };
}
