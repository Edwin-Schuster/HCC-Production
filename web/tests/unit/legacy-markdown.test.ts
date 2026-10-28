import { describe, expect, it } from "vitest";
import { legacyMarkdownToBlocks } from "@/server/import/legacy-markdown";
import { DocumentSchema } from "@/blocks/schema";

const SOURCE = `Follow this order every Sunday.

:::note Who this is for
Every volunteer.
:::

## Steps

:::steps
### Unlock the booth
Check the UPS shows **Online**.

### Power the racks
Wait for the lights.
![rack](/files/abc)
:::

:::danger Never end the stream from the encoder first
End the event in YouTube Studio first.
:::

:::accordion What if the console will not boot?
Hold the power button for 10 seconds.
:::

@[youtube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)

| A | B |
| --- | --- |
| 1 | 2 |`;

describe("legacy SOP markdown", () => {
  it("turns containers into steps and callouts and keeps plain markdown", () => {
    const blocks = legacyMarkdownToBlocks(SOURCE);
    expect(blocks.map((b) => b.type)).toEqual(["text", "callout", "heading", "step", "step", "callout", "callout", "video", "table"]);
    const [, note, , s1, s2, danger, faq] = blocks;
    expect(note.content).toMatchObject({ variant: "info" });
    expect(JSON.stringify(note.content)).toContain("Who this is for");
    expect(s1.content).toMatchObject({ description: "Check the UPS shows **Online**." });
    expect(s2.children.map((c) => c.type)).toEqual(["image"]);
    expect(danger.content).toMatchObject({ variant: "danger" });
    expect(JSON.stringify(faq.content)).toContain("What if the console will not boot?");
    expect(DocumentSchema.safeParse(blocks).success).toBe(true);
  });
});
