import { describe, expect, it } from "vitest";
import { isFull, remapAnnotations } from "@/editor/image-edit";

describe("image crop", () => {
  it("moves annotations into the cropped area and drops ones left outside", () => {
    const crop = { x: 0.5, y: 0, w: 0.5, h: 0.5 };
    const out = remapAnnotations(
      [
        { kind: "box", x: 0.6, y: 0.1, w: 0.2, h: 0.2 },
        { kind: "marker", x: 0.1, y: 0.1, w: 0, h: 0, n: 1 },
        { kind: "blur", x: 0.9, y: 0.4, w: 0.2, h: 0.2 },
      ],
      crop,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "box", x: expect.closeTo(0.2), y: expect.closeTo(0.2), w: expect.closeTo(0.4), h: expect.closeTo(0.4) });
    expect(out[1].kind).toBe("blur");
  });

  it("treats a crop that covers the whole image as no crop", () => {
    expect(isFull({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(isFull({ x: 0.1, y: 0, w: 0.9, h: 1 })).toBe(false);
  });
});
