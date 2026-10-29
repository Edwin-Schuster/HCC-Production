import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BlockNode } from "@/blocks/schema";
import { numberSteps, plain, walk } from "@/blocks/tree";
import { finalizeImport, parseImport } from "@/server/import";

const fixture = (f: string) => new Uint8Array(readFileSync(path.join(import.meta.dirname, "../fixtures", f)));

const outline = (blocks: BlockNode[]) => {
  const n = numberSteps(blocks);
  return [...walk(blocks)].map(({ node }) => {
    if (node.type === "step") return `step ${n.get(node.id)} ${plain(node.content.title)}`;
    if (node.type === "heading") return `h${node.content.level} ${plain(node.content.text)}`;
    if (node.type === "checklist") return `[${node.content.checked ? "x" : " "}] ${plain(node.content.text)}`;
    if (node.type === "callout") return `${node.content.variant}: ${plain(node.content.text)}`;
    if (node.type === "text") return `text ${plain(node.content.text)}`;
    return node.type;
  });
};

describe("import", () => {
  it("turns Markdown headings into sections, numbered lists into nested steps, and labels into callouts", async () => {
    const res = await parseImport("lamp.md", fixture("sample.md"));
    expect(res.title).toBe("Projector Lamp Swap");
    expect(outline(res.blocks)).toEqual([
      "text Replace the sanctuary projector lamp safely.",
      "warning: The lamp is hot for 15 minutes after power-off.",
      "h1 Before you start",
      "[ ] Spare lamp from the cabinet",
      "[x] Ladder",
      "h1 Procedure",
      "step 1 Power down the projector",
      "step 2 Wait for the lamp to cool",
      "step 2.1 Check the housing is cool to touch",
      "step 2.2 Remove the lamp door screws",
      "step 3 Install the new lamp",
      "table",
      "code",
      "info: Log the swap in the gear record.",
    ]);
  });

  it("reads Word documents the same way", async () => {
    const res = await parseImport("lamp.docx", fixture("sample.docx"));
    const o = outline(res.blocks);
    expect(o).toContain("step 2.2 Remove the lamp door screws");
    expect(o).toContain("warning: The lamp is hot for 15 minutes after power-off.");
    expect(o).toContain("table");
    const { blocks } = await finalizeImport(res.blocks, async () => "/files/x");
    expect(blocks.length).toBe(res.blocks.length);
  });

  it("re-nests Google Docs' flat lists and unwraps its link redirects", async () => {
    const res = await parseImport("Mic Check.html", fixture("gdocs.html"));
    expect(res.title).toBe("Mic Check");
    expect(outline(res.blocks)).toEqual(["h2 Steps", "step 1 Turn on receivers", "step 1.1 Check RF bars", "step 1.2 Check battery", "step 2 Walk the room with each pack", "text See the RF plan"]);
    const link = res.blocks.at(-1)!;
    expect(link.type === "text" && link.content.text.find((r) => r.href)?.href).toBe("https://example.org/rf");
  });

  it("uploads embedded images and rejects unsupported files", async () => {
    const md = new TextEncoder().encode("1. Step with a picture\n\n![rack](data:image/png;base64,iVBORw0KGgo=)\n");
    const res = await parseImport("x.md", md);
    const { blocks } = await finalizeImport(res.blocks, async () => "/files/00000000-0000-0000-0000-000000000000");
    expect(blocks.find((b) => b.type === "image")).toMatchObject({ content: { url: "/files/00000000-0000-0000-0000-000000000000", caption: "rack" } });
    await expect(parseImport("x.pdf", new Uint8Array([1, 2, 3]))).rejects.toThrow(/Upload a Word/);
  });
});

describe("Markdown lists that start at 1 again", () => {
  it("restart the step numbering; a continued list (4.) does not", async () => {
    const md = "# Two lists\n\n## Setup\n\n1. a\n2. b\n\n## Teardown\n\n1. c\n2. d\n\nNote: between\n\n3. e\n";
    const r = await parseImport("two.md", new TextEncoder().encode(md));
    const n = numberSteps(r.blocks);
    expect(r.blocks.filter((b) => b.type === "step").map((b) => n.get(b.id))).toEqual(["1", "2", "1", "2", "3"]);
  });
});
