import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("markdown", () => {
  it("renders formatting but never raw HTML or script links", () => {
    expect(renderMarkdown("**bold** and `code`")).toContain("<strong>bold</strong>");
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) ![p](data:image/png;base64,AA)');
    expect(html).not.toMatch(/<script|<img src="x"|href="javascript|src="data:/i);
    expect(html).toContain("&lt;script&gt;");
    expect(renderMarkdown("[site](https://example.org)")).toContain('href="https://example.org" target="_blank" rel="noopener noreferrer"');
    expect(renderMarkdown("![rack](/files/abc)")).toContain('src="/files/abc"');
  });
});
