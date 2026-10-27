import type { PointerEvent as ReactPointerEvent, SVGProps } from "react";
import type { LayoutItem, LayoutRun } from "@/db/schema";
import { DEVICE_TYPES, type DeviceType } from "@/lib/cabling";
import { cn } from "@/lib/utils";

export type LayoutDoc = { name: string; backgroundUrl: string | null; width: number; height: number; items: LayoutItem[]; runs: LayoutRun[] };

type Handlers = {
  onItemDown?: (e: ReactPointerEvent, item: LayoutItem) => void;
  onResizeDown?: (e: ReactPointerEvent, item: LayoutItem) => void;
  onRunDown?: (e: ReactPointerEvent, run: LayoutRun) => void;
};

const glyph = (t: string) => DEVICE_TYPES[t as DeviceType]?.[1] ?? "?";

export function centerOf(i: LayoutItem) {
  return i.type === "zone" ? { x: i.x + (i.w ?? 200) / 2, y: i.y + (i.h ?? 120) / 2 } : { x: i.x, y: i.y };
}

export function runPath(r: LayoutRun, a: { x: number; y: number }, b: { x: number; y: number }) {
  if (r.style === "elbow") return { d: `M${a.x},${a.y} L${b.x},${a.y} L${b.x},${b.y}`, lx: b.x, ly: a.y };
  return { d: `M${a.x},${a.y} L${b.x},${b.y}`, lx: (a.x + b.x) / 2, ly: (a.y + b.y) / 2 };
}

/**
 * A room layout drawn as SVG: floor plan, zones, cable runs and devices. Used for thumbnails, printing
 * and (with handlers) the editor. Colours come from theme tokens so it works light and dark.
 */
export function LayoutSvg({ doc, mini, selected, connectFrom, svgRef, className, svgProps, ...h }: { doc: LayoutDoc; mini?: boolean; selected?: string | null; connectFrom?: string | null; svgRef?: React.Ref<SVGSVGElement>; className?: string; svgProps?: SVGProps<SVGSVGElement> } & Handlers) {
  const pos = new Map(doc.items.map((i) => [i.id, centerOf(i)]));
  const zones = doc.items.filter((i) => i.type === "zone");
  const devices = doc.items.filter((i) => i.type !== "zone");
  const grid = mini ? "grid-m" : "grid-e";
  return (
    <svg {...svgProps} ref={svgRef} viewBox={`0 0 ${doc.width} ${doc.height}`} className={cn("block h-auto w-full select-none", className)} role="img" aria-label={doc.name}>
      <defs>
        <pattern id={grid} width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="var(--color-line)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={doc.width} height={doc.height} fill="var(--color-surface)" />
      {doc.backgroundUrl && <image href={doc.backgroundUrl} x="0" y="0" width={doc.width} height={doc.height} preserveAspectRatio="xMidYMid meet" opacity="0.85" />}
      <rect width={doc.width} height={doc.height} fill={`url(#${grid})`} opacity={doc.backgroundUrl ? 0.4 : 1} />

      {zones.map((z) => (
        <g key={z.id} onPointerDown={h.onItemDown && ((e) => h.onItemDown!(e, z))} className={h.onItemDown ? "cursor-move" : undefined} data-item={z.id}>
          <rect x={z.x} y={z.y} width={z.w ?? 200} height={z.h ?? 120} rx="6" fill="var(--color-wash)" stroke={selected === z.id ? "var(--color-cta)" : "var(--color-line-2)"} strokeWidth={selected === z.id ? 2.5 : 1.5} strokeDasharray={selected === z.id ? undefined : "6 4"} />
          <text x={z.x + 10} y={z.y + 22} fontSize="15" fontWeight="600" fill="var(--color-muted)" letterSpacing="0.06em">
            {z.label}
          </text>
          {!mini && selected === z.id && h.onResizeDown && (
            <rect x={z.x + (z.w ?? 200) - 10} y={z.y + (z.h ?? 120) - 10} width="20" height="20" rx="3" fill="var(--color-cta)" className="cursor-nwse-resize" onPointerDown={(e) => h.onResizeDown!(e, z)} aria-label="Resize" />
          )}
        </g>
      ))}

      {doc.runs.map((r) => {
        const a = pos.get(r.from);
        const b = pos.get(r.to);
        if (!a || !b) return null;
        const { d, lx, ly } = runPath(r, a, b);
        const color = r.color ?? "#a3a3a3";
        const w = Math.max(40, r.label.length * 8 + 16);
        return (
          <g key={r.id} onPointerDown={h.onRunDown && ((e) => h.onRunDown!(e, r))} className={h.onRunDown ? "cursor-pointer" : undefined} data-run={r.id}>
            {h.onRunDown && <path d={d} stroke="transparent" strokeWidth="18" fill="none" />}
            <path d={d} stroke={color} strokeWidth={selected === r.id ? 5 : 3} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={selected && selected !== r.id ? 0.7 : 1} />
            {!mini && r.label && (
              <g transform={`translate(${lx},${ly})`}>
                <rect x={-w / 2} y="-11" width={w} height="22" rx="4" fill="var(--color-surface-2)" stroke={color} />
                <text textAnchor="middle" dy="4.5" fontSize="12" fontFamily="var(--font-mono)" fill="var(--color-fg-hi)">
                  {r.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {devices.map((d) => (
        <g key={d.id} transform={`translate(${d.x},${d.y})`} onPointerDown={h.onItemDown && ((e) => h.onItemDown!(e, d))} className={h.onItemDown ? "cursor-move" : undefined} data-item={d.id}>
          {h.onItemDown && <circle r="26" fill="transparent" />}
          <circle r="17" fill="var(--color-surface-3)" stroke={selected === d.id || connectFrom === d.id ? "var(--color-cta)" : "var(--color-fg-2)"} strokeWidth={selected === d.id || connectFrom === d.id ? 3 : 1.5} />
          <text textAnchor="middle" dy="5" fontSize="14" fontWeight="600" fill="var(--color-fg-hi)">
            {glyph(d.type)}
          </text>
          {!mini && d.label && (
            <text textAnchor="middle" y="36" fontSize="12.5" fill="var(--color-fg-2)" paintOrder="stroke" stroke="var(--color-surface)" strokeWidth="4" strokeLinejoin="round">
              {d.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
