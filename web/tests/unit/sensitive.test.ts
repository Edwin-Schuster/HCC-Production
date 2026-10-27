import { describe, expect, it } from "vitest";
import { findSensitive, type OcrLine } from "@/editor/sensitive";

/** Words laid out left to right on one line, 10px per character plus a 10px gap. */
function line(y: number, ...texts: string[]): OcrLine {
  let x = 0;
  return {
    words: texts.map((text) => {
      const w = { text, bbox: { x0: x, y0: y, x1: x + text.length * 10, y1: y + 20 } };
      x = w.bbox.x1 + 10;
      return w;
    }),
  };
}

describe("findSensitive", () => {
  it("hides the value after a password label but not the label", () => {
    const [box] = findSensitive([line(0, "Password:", "hunter2", "!")], 0);
    expect(box).toEqual({ x0: 100, y0: 0, x1: 190, y1: 20 });
  });

  it("hides masked inputs and long numbers, including card numbers split by spaces", () => {
    const boxes = findSensitive([line(0, "PIN", "••••"), line(40, "Card", "4111", "1111", "1111", "1111"), line(80, "Version", "4.2.1", "build", "12")], 0);
    expect(boxes).toHaveLength(2);
    expect(boxes[1]).toEqual({ x0: 50, y0: 40, x1: 240, y1: 60 });
  });

  it("handles two-word labels like 'Account number'", () => {
    const [box] = findSensitive([line(0, "Account", "number", "000123456789")], 0);
    expect(box.x0).toBe(150);
  });

  it("leaves ordinary text alone, including labels used as plain words", () => {
    expect(findSensitive([line(0, "Turn", "on", "the", "amps"), line(30, "Channel", "12"), line(60, "Stream", "key", "settings")])).toEqual([]);
    expect(findSensitive([line(0, "key", "s3cr3t-value")])).toHaveLength(1);
  });
});
