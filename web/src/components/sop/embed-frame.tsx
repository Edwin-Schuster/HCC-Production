"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Tells the parent page (embed.js) how tall the content is, so the iframe never scrolls on its own. */
export function EmbedFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.parent === window) return;
    const post = () => window.parent.postMessage({ type: "hcc-embed-height", height: Math.ceil(el.getBoundingClientRect().height) + 2 }, "*");
    const ro = new ResizeObserver(post);
    ro.observe(el);
    post();
    return () => ro.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}
