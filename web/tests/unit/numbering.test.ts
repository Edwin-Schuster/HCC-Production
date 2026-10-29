import { describe, expect, it } from "vitest";
import { DocumentSchema, type BlockNode } from "@/blocks/schema";
import { buildTree, flatten, numberSteps, outline } from "@/blocks/tree";

let seq = 0;
const step = (title: string, children: BlockNode[] = []): BlockNode =>
  ({ id: `s${++seq}`, key: `s${seq}`, type: "step", content: { title: [{ text: title }], description: "", roleId: null, estDuration: null, expectedResult: "", warning: "", collapsed: false }, children }) as BlockNode;
const heading = (text: string, children: BlockNode[] = []): BlockNode =>
  ({ id: `h${++seq}`, key: `h${seq}`, type: "heading", content: { level: 2, text: [{ text }] }, children }) as BlockNode;
const callout = (children: BlockNode[] = []): BlockNode =>
  ({ id: `c${++seq}`, key: `c${seq}`, type: "callout", content: { variant: "info", text: [{ text: "note" }] }, children }) as BlockNode;

const labels = (doc: BlockNode[]) => {
  const n = numberSteps(doc);
  const out: string[] = [];
  const visit = (l: BlockNode[]) => l.forEach((b) => { if (b.type === "step") out.push(`${n.get(b.id)} ${b.content.title[0].text}`); visit(b.children); });
  visit(doc);
  return out;
};

describe("numberSteps", () => {
  it("numbers top-level steps across headings", () => {
    const doc = [heading("Prep"), step("a"), step("b"), heading("Run"), step("c")];
    expect(labels(doc)).toEqual(["1 a", "2 b", "3 c"]);
  });

  it("numbers nested sub-steps as 3.2.1", () => {
    const doc = [step("a"), step("b"), step("c", [step("c1"), step("c2", [step("c2a"), step("c2b")])]), step("d")];
    expect(labels(doc)).toEqual(["1 a", "2 b", "3 c", "3.1 c1", "3.2 c2", "3.2.1 c2a", "3.2.2 c2b", "4 d"]);
  });

  it("renumbers after reordering, inserting and removing", () => {
    const a = step("a"), b = step("b"), c = step("c");
    expect(labels([a, b, c])).toEqual(["1 a", "2 b", "3 c"]);
    expect(labels([c, a, b])).toEqual(["1 c", "2 a", "3 b"]);
    expect(labels([a, step("new"), c])).toEqual(["1 a", "2 new", "3 c"]);
    expect(labels([a, c])).toEqual(["1 a", "2 c"]);
  });

  it("skips non-step blocks and keeps numbers unique for steps inside other blocks", () => {
    const doc = [step("a"), callout([step("inside")]), step("b", [callout([step("deep")]), step("b2")])];
    expect(labels(doc)).toEqual(["1 a", "2 inside", "3 b", "3.1 deep", "3.2 b2"]);
  });

  it("outline lists headings and top-level steps with numbers", () => {
    const doc = [heading("Prep"), step("a", [step("a1")]), step("b")];
    expect(outline(doc).map((o) => `${o.number ?? "#"} ${o.label}`)).toEqual(["# Prep", "1 a", "2 b"]);
  });
});

describe("flatten / buildTree", () => {
  it("round-trips a nested document", () => {
    const doc = [heading("Prep"), step("a", [step("a1", [step("a1x")]), step("a2")]), step("b")];
    const rows = flatten(doc);
    expect(rows.map((r) => [r.parentId, r.position])).toEqual([[null, 0], [null, 1], [doc[1].id, 0], [doc[1].children[0].id, 0], [doc[1].id, 1], [null, 2]]);
    const rebuilt = buildTree(rows, (r) => ({ id: r.id, key: r.key, type: r.node.type, content: r.node.content }) as never);
    expect(labels(rebuilt)).toEqual(labels(doc));
  });
});

describe("DocumentSchema", () => {
  it("applies step defaults and rejects bad content", () => {
    const ok = DocumentSchema.parse([{ id: "x", type: "step", content: { title: [{ text: "Do it" }] } }]);
    expect(ok[0]).toMatchObject({ key: "x", content: { description: "", warning: "", estDuration: null } });
    expect(DocumentSchema.safeParse([{ id: "x", type: "callout", content: { variant: "purple", text: [] } }]).success).toBe(false);
    expect(DocumentSchema.safeParse([{ id: "x", type: "text", content: { text: [{ text: "a", href: "javascript:alert(1)" }] } }]).success).toBe(false);
    expect(DocumentSchema.safeParse([{ id: "x", type: "text", content: { text: [] } }, { id: "x", type: "divider", content: {} }]).success).toBe(false);
  });

  it("limits nesting depth", () => {
    let node: Record<string, unknown> = { id: "d0", type: "step", content: { title: [] } };
    for (let i = 1; i <= 7; i++) node = { id: `d${i}`, type: "step", content: { title: [] }, children: [node] };
    expect(DocumentSchema.safeParse([node]).success).toBe(false);
  });
});

describe("restarting the numbering", () => {
  const restart = (title: string, children: BlockNode[] = []): BlockNode => {
    const s = step(title, children);
    return { ...s, content: { ...s.content, restart: true } } as BlockNode;
  };

  it("starts top-level steps again at 1, keeping sub-steps under their own step", () => {
    const doc = [heading("Setup"), step("a"), step("b", [step("b1")]), heading("Teardown"), restart("c"), step("d", [step("d1")])];
    expect(labels(doc)).toEqual(["1 a", "2 b", "2.1 b1", "1 c", "2 d", "2.1 d1"]);
  });

  it("ignores the flag on sub-steps", () => {
    expect(labels([step("a", [step("a1"), restart("a2")])])).toEqual(["1 a", "1.1 a1", "1.2 a2"]);
  });
});
