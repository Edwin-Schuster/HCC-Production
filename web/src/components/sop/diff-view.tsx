import type { DiffEntry, Segment } from "@/blocks/diff";
import { fieldsOf } from "@/blocks/diff";
import { cn } from "@/lib/utils";

const STATUS = {
  added: { label: "Added", bar: "bg-good", text: "text-good" },
  removed: { label: "Removed", bar: "bg-bad", text: "text-bad" },
  changed: { label: "Changed", bar: "bg-warn", text: "text-warn" },
  moved: { label: "Moved", bar: "bg-iris", text: "text-iris-text" },
  same: { label: "", bar: "bg-transparent", text: "text-muted" },
} as const;

const TYPE: Record<string, string> = { heading: "Heading", text: "Text", checklist: "Checklist item", callout: "Callout", code: "Code", table: "Table", image: "Image", video: "Video", embed: "Embed", snippet_ref: "Snippet", divider: "Divider" };

function Segments({ segments }: { segments: Segment[] }) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {segments.map((s, i) =>
        s.op === "same" ? (
          <span key={i}>{s.text}</span>
        ) : s.op === "add" ? (
          <ins key={i} className="rounded-[2px] bg-good-soft text-good no-underline">
            {s.text}
          </ins>
        ) : (
          <del key={i} className="rounded-[2px] bg-bad-soft text-bad decoration-bad/60">
            {s.text}
          </del>
        ),
      )}
    </span>
  );
}

/** One row per block that changed; unchanged runs collapse to a count unless `full` is set. */
export function DiffView({ entries, full }: { entries: DiffEntry[]; full?: boolean }) {
  const rows: (DiffEntry | { gap: number })[] = [];
  for (const e of entries) {
    if (!full && e.status === "same") {
      const last = rows[rows.length - 1];
      if (last && "gap" in last) last.gap++;
      else rows.push({ gap: 1 });
    } else rows.push(e);
  }
  return (
    <ol className="overflow-hidden rounded-[12px] border border-line" role="list">
      {rows.map((r, i) => {
        if ("gap" in r)
          return (
            <li key={`gap-${i}`} className="border-b border-line bg-surface px-4 py-1.5 text-xs text-faint last:border-0">
              {r.gap} unchanged block{r.gap === 1 ? "" : "s"}
            </li>
          );
        const st = STATUS[r.status];
        const main = r.node.type === "step" ? "title" : Object.keys(fieldsOf(r.node))[0];
        const mainChange = r.fields.find((f) => f.field === main);
        const mainText = main ? (fieldsOf(r.node)[main]?.[1] ?? "") : "";
        const others = r.fields.filter((f) => f.field !== main);
        return (
          <li key={r.key} className="relative border-b border-line px-4 py-2.5 last:border-0" style={{ paddingLeft: 16 + r.depth * 20 }}>
            <span className={cn("absolute inset-y-0 left-0 w-[3px]", st.bar)} aria-hidden />
            <div className="flex items-start gap-2.5">
              {r.node.type === "step" ? (
                <span className="mt-[1px] flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full border border-line-2 px-1.5 font-mono text-[11px] text-fg-2">{r.number ?? r.oldNumber}</span>
              ) : (
                <span className="mt-[3px] w-20 shrink-0 text-xs text-muted">{TYPE[r.node.type] ?? r.node.type}</span>
              )}
              <div className={cn("min-w-0 flex-1 text-[14px]", r.status === "removed" ? "text-muted line-through decoration-bad/50" : r.status === "same" ? "text-muted" : "text-fg-hi")}>
                {mainChange ? <Segments segments={mainChange.segments} /> : mainText || <span className="text-faint">(empty)</span>}
                {others.length > 0 && (
                  <dl className="mt-1.5 grid gap-1 text-[13px] text-fg-2">
                    {others.map((f) => (
                      <div key={f.field} className="flex gap-2">
                        <dt className="w-28 shrink-0 text-xs text-muted">{f.label}</dt>
                        <dd className="min-w-0">
                          <Segments segments={f.segments} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              {r.status !== "same" && (
                <span className={cn("shrink-0 text-xs", st.text)}>
                  {st.label}
                  {r.status === "moved" && r.oldNumber && r.number && r.oldNumber !== r.number ? ` (was ${r.oldNumber})` : ""}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
