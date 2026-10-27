"use client";

import { useEffect, useId, useState } from "react";
import { useTheme } from "@/components/theme";
import { CopyButton } from "@/components/copy-button";

/** Renders Mermaid source in the browser (Mermaid needs the DOM). Strict mode: no HTML or scripts in labels. */
export function Flowchart({ source }: { source: string }) {
  const theme = useTheme() ?? "dark";
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<{ for: string; html: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${theme}:${source}`;

  useEffect(() => {
    let cancelled = false;
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: theme === "light" ? "neutral" : "dark", fontFamily: "inherit", flowchart: { curve: "basis", htmlLabels: false } });
      try {
        const { svg } = await mermaid.render(`flow${id}`, source);
        if (!cancelled) setSvg({ for: key, html: svg });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't draw the flowchart.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, key, source, theme]);

  return (
    <div>
      <div className="overflow-x-auto rounded-[12px] border border-line bg-surface p-4">
        {error ? (
          <p className="text-[13px] text-bad">{error}</p>
        ) : svg?.for === key ? (
          // Mermaid's own SVG output, rendered with securityLevel "strict".
          <div className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg.html }} />
        ) : (
          <div className="h-64 animate-pulse rounded-[8px] bg-wash-2" aria-busy aria-label="Drawing flowchart" />
        )}
      </div>
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-muted hover:text-fg-hi">Mermaid source</summary>
        <div className="mt-2 overflow-hidden rounded-[6px] border border-line bg-surface">
          <div className="flex justify-end border-b border-line p-1">
            <CopyButton text={source} />
          </div>
          <pre className="overflow-x-auto p-3 font-mono text-xs text-fg-2">{source}</pre>
        </div>
      </details>
    </div>
  );
}
