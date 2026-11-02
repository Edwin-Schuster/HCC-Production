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

describe("SOP Markdown", () => {
  it("imports the format guide with step details, sub-steps, branches, callouts and restarts", async () => {
    const guide = readFileSync(path.join(__dirname, "../../public/sop-markdown-guide.md"));
    const r = await parseImport("sop-markdown-guide.md", new Uint8Array(guide));
    expect(r.title).toBe("SOP Markdown Format Guide");
    expect(r.meta).toMatchObject({ summary: expect.stringContaining("imports with its steps"), tags: ["import", "guide"] });
    const steps = [...walk(r.blocks)].map((x) => x.node).filter((n) => n.type === "step");
    const n = numberSteps(r.blocks);
    const first = steps[0];
    expect(plain(first.content.title)).toBe("Write each step as a numbered list item");
    expect(first.content).toMatchObject({ roleId: "name:Technical Director", estDuration: 2, expectedResult: "The step shows its role, time and expected result." });
    expect(first.content.description).toContain("**bold** and `code`");
    expect(steps[1].content.warning).toContain("own warning");
    expect(steps.map((s) => n.get(s.id))).toEqual(["1", "2", "3", "3.1", "3.2", "4", "5", "6", "1", "2"]);
    const branch = steps.find((s) => s.content.branches.length)!;
    expect(branch.content.branches[0]).toEqual({ condition: "The projector doesn't turn on", target: steps[7].key });
    const kinds = r.blocks.filter((b) => b.type === "callout").map((b) => b.content.variant);
    expect(kinds).toEqual(["info", "warning", "danger", "warning"]);
    // The image is in a zip only, so a .md on its own warns about it.
    expect(r.warnings.join(" ")).toMatch(/\.zip/);
    expect(JSON.stringify(r.blocks)).not.toContain("⟦");
  });

  it("imports a .zip package with its images, sizes and captions", async () => {
    const { zipSync } = await import("fflate");
    const png = new Uint8Array(readFileSync(path.join(__dirname, "../fixtures/two-tone.png")));
    const md = "# Rack\n\n1. Check the rack\n   - time: 90 seconds\n\n   ![Front of the rack](images/rack.png \"width=360\")\n\n![Wide shot](./images/rack.png)\n";
    const zip = zipSync({ "rack-sop/rack.md": new TextEncoder().encode(md), "rack-sop/images/rack.png": png });
    const r = await parseImport("rack-sop.zip", zip);
    expect(r.title).toBe("Rack");
    const step = r.blocks.find((b) => b.type === "step")!;
    expect(step.content).toMatchObject({ estDuration: 2 });
    const img = step.children.find((c) => c.type === "image")!;
    expect(img.content).toMatchObject({ caption: "Front of the rack", width: 360 });
    expect(img.content.url).toMatch(/^data:image\/png;base64,/);
    expect(r.blocks.find((b) => b.type === "image")?.content).toMatchObject({ caption: "Wide shot", width: null });
    expect(r.warnings).toEqual([]);
    const done = await finalizeImport(r.blocks, async () => "/files/rack.png");
    expect(JSON.stringify(done.blocks)).toContain("/files/rack.png");
  });
});
