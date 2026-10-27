import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/** Safe rendered Markdown (raw HTML is escaped and only safe link targets are kept). */
export function Markdown({ source, className }: { source: string; className?: string }) {
  // renderMarkdown escapes raw HTML and filters URLs, so this is safe to insert.
  return <div className={cn("md text-fg-2", className)} dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}
