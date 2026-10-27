import { describe, expect, it } from "vitest";
import { callout, step } from "@/blocks/build";
import type { BlockNode } from "@/blocks/schema";
import { diffVersions, diffWords, summarize } from "@/blocks/diff";
import { cloneWithNewIds } from "@/blocks/tree";

const retitle = (n: BlockNode, title: string): BlockNode => (n.type === "step" ? { ...n, content: { ...n.content, title: [{ text: title }] } } : n);

describe("diffWords", () => {
  it("marks inserted and deleted words", () => {
    expect(diffWords("Turn on the amps", "Turn on all the amps")).toEqual([
      { op: "same", text: "Turn on " },
      { op: "add", text: "all " },
      { op: "same", text: "the amps" },
    ]);
    expect(diffWords("", "new")).toEqual([{ op: "add", text: "new" }]);
  });
});

describe("diffVersions", () => {
  it("matches blocks by key across versions even though ids change", () => {
    const a = step("Power on");
    const b = step("Load show");
    const c = step("Line check");
    const v1 = [a, b, c];
    const v2 = cloneWithNewIds([retitle(a, "Power on the UPS"), c, step("Lock up")]); // b removed, one added
    const d = diffVersions(v1, v2);
    expect(d.map((e) => [e.status, e.number ?? e.oldNumber])).toEqual([
      ["changed", "1"],
      ["removed", "2"],
      ["same", "2"],
      ["added", "3"],
    ]);
    expect(d[0].fields[0]).toMatchObject({ field: "title", segments: [{ op: "same", text: "Power on" }, { op: "add", text: " the UPS" }] });
    expect(summarize(d)).toEqual({ added: 1, removed: 1, changed: 1, moved: 0 });
  });

  it("reports reordered and re-nested blocks as moved", () => {
    const a = step("A");
    const b = step("B");
    const note = callout("info", "Note");
    const v2 = cloneWithNewIds([b, { ...a, children: [note] } as BlockNode]);
    const d = diffVersions([a, b, note], v2);
    expect(d.find((e) => e.key === a.key)?.status).toBe("moved");
    expect(d.find((e) => e.key === note.key)?.status).toBe("moved");
  });
});
