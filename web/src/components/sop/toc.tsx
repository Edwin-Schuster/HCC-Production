import type { OutlineItem } from "@/blocks/tree";
import { cn } from "@/lib/utils";

export function Toc({ items, className }: { items: OutlineItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <nav aria-label="On this page" className={cn("text-[12.5px]", className)}>
      <p className="mb-2 font-[510] text-fg-hi">On this page</p>
      <ol className="grid gap-px border-l border-line">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#b-${i.id}`}
              className={cn(
                "-ml-px flex gap-2 border-l border-transparent py-1 leading-snug text-muted transition-colors hover:border-fg-2 hover:text-fg-hi",
                i.level <= 2 ? "pl-3" : i.level === 3 ? "pl-5" : "pl-5",
                i.level <= 2 && "text-fg-2",
              )}
            >
              {i.number && <span className="font-mono text-[11px] text-faint">{i.number}</span>}
              <span className="min-w-0">{i.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
