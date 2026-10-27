import { describe, expect, it } from "vitest";
import { DocumentSchema, type BlockNode } from "@/blocks/schema";
import { callout, check, code, divider, h, image, p, step, table } from "@/blocks/build";
import { fromBlockNote, inlineFromBN, keyMap, toBlockNote, type BNBlock } from "@/editor/convert";

/** What BlockNote hands back after loading partial blocks: every block gets props and children. */
const normalize = (blocks: ReturnType<typeof toBlockNote>): BNBlock[] =>
  blocks.map((b) => ({ id: b.id!, type: b.type, props: b.props ?? {}, content: b.content, children: normalize(b.children ?? []) }));

describe("editor conversion", () => {
  it("round-trips every block type without losing data", () => {
    const doc: BlockNode[] = [
      callout("warning", "**Power order** matters"),
      h("Procedure"),
      p("Plain text with `code`"),
      check("Booth key"),
      step("Start the console", { roleId: "role-1", minutes: 4, expected: "48 kHz", warning: "Wait for boot", description: "Load the show file" }, [step("Recall scene 1")]),
      code("a = 1", "text"),
      table([["Rack", "Breaker"], ["A", "B-12"]]),
      image("/seed/rack-diagram.svg", "Racks"),
      divider(),
    ];
    const back = fromBlockNote(normalize(toBlockNote(doc)), keyMap(doc));
    expect(DocumentSchema.parse(back)).toEqual(doc);
  });

  it("keeps stable keys for loaded blocks and uses the id for new ones", () => {
    const loaded = [{ ...p("x"), id: "editor-id", key: "stable-key" }];
    const out = fromBlockNote([...normalize(toBlockNote(loaded)), { id: "new", type: "paragraph", props: {}, content: [], children: [] }], keyMap(loaded));
    expect(out.map((b) => b.key)).toEqual(["stable-key", "new"]);
  });

  it("drops unsafe link targets but keeps the text", () => {
    const rt = inlineFromBN([{ type: "link", href: "javascript:alert(1)", content: [{ type: "text", text: "click" }] }]);
    expect(rt).toEqual([{ text: "click" }]);
  });

  it("turns unknown block types into text and drops empty image placeholders", () => {
    const out = fromBlockNote([
      { id: "a", type: "bulletListItem", props: {}, content: [{ type: "text", text: "item", styles: {} }], children: [] },
      { id: "b", type: "image", props: { url: "" }, children: [] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "text", content: { text: [{ text: "item" }] } });
  });
});
