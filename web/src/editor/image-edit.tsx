"use client";

import { Crop as CropIcon, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { Annotation } from "@/blocks/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** A crop rectangle as fractions of the image (0–1). */
export type Crop = { x: number; y: number; w: number; h: number };
export const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };
export const isFull = (c: Crop) => c.x <= 0.001 && c.y <= 0.001 && c.w >= 0.999 && c.h >= 0.999;

export const SIZES = [
  { label: "Small", width: 320 },
  { label: "Medium", width: 480 },
  { label: "Large", width: 720 },
  { label: "Full width", width: null },
] as const;
const ASPECTS = [
  { label: "Free", ratio: null },
  { label: "16:9", ratio: 16 / 9 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "1:1", ratio: 1 },
] as const;
const MIN = 0.04;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The largest centred crop with this pixel aspect ratio. */
function centred(ratio: number, W: number, H: number): Crop {
  const w = Math.min(1, (H * ratio) / W);
  const h = Math.min(1, (W / ratio) / H);
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** Moves annotations drawn on the full image into the cropped image's coordinates; drops ones left outside it. */
export function remapAnnotations(list: Annotation[], c: Crop): Annotation[] {
  const out: Annotation[] = [];
  for (const a of list) {
    const x = (a.x - c.x) / c.w;
    const y = (a.y - c.y) / c.h;
    const w = a.w / c.w;
    const h = a.h / c.h;
    const [x0, x1] = [Math.min(x, x + w), Math.max(x, x + w)];
    const [y0, y1] = [Math.min(y, y + h), Math.max(y, y + h)];
    if (x1 < 0 || y1 < 0 || x0 > 1 || y0 > 1) continue;
    out.push({ ...a, x: clamp(x, -1, 2), y: clamp(y, -1, 2), w: clamp(w, -2, 2), h: clamp(h, -2, 2) });
  }
  return out;
}

/** Draws the cropped part of an image at full resolution. */
export async function cropImage(img: HTMLImageElement, c: Crop, type: string): Promise<Blob> {
  const [W, H] = [img.naturalWidth, img.naturalHeight];
  const sx = Math.round(c.x * W);
  const sy = Math.round(c.y * H);
  const sw = Math.max(1, Math.round(c.w * W));
  const sh = Math.max(1, Math.round(c.h * H));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.92));
  if (!blob) throw new Error("export failed");
  return blob;
}

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Exclude<Handle, "move">[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function ImageEditDialog({
  open,
  src,
  width: initialWidth,
  canCrop,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  /** The image to crop (the unannotated original when there is one). */
  src: string;
  width: number | null;
  /** Linked images from other sites can be resized but not cropped (the browser won't let us read them). */
  canCrop: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (result: { width: number | null; crop: Crop | null; img: HTMLImageElement | null }) => Promise<void>;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [width, setWidth] = useState<number | null>(initialWidth);
  const [crop, setCrop] = useState<Crop>(FULL);
  const [aspect, setAspect] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; start: { x: number; y: number }; orig: Crop } | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const i = new Image();
    i.onload = () => alive && setImg(i);
    i.src = src;
    return () => {
      alive = false;
    };
  }, [open, src]);

  const W = img?.naturalWidth ?? 1;
  const H = img?.naturalHeight ?? 1;
  const croppedW = Math.round(crop.w * W);
  const shownWidth = width ?? null;

  const point = (e: RPointerEvent) => {
    const r = surface.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const onDown = (e: RPointerEvent<HTMLElement>) => {
    const handle = (e.currentTarget.dataset.handle ?? "move") as Handle;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, start: point(e), orig: crop };
  };

  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    const o = d.orig;
    if (d.handle === "move") {
      setCrop({ ...o, x: clamp(o.x + dx, 0, 1 - o.w), y: clamp(o.y + dy, 0, 1 - o.h) });
      return;
    }
    let [l, t, r, b] = [o.x, o.y, o.x + o.w, o.y + o.h];
    if (d.handle.includes("w")) l = clamp(l + dx, 0, r - MIN);
    if (d.handle.includes("e")) r = clamp(r + dx, l + MIN, 1);
    if (d.handle.includes("n")) t = clamp(t + dy, 0, b - MIN);
    if (d.handle.includes("s")) b = clamp(b + dy, t + MIN, 1);
    if (aspect) {
      // Keep the pixel ratio: height follows width (for edge handles on top/bottom, width follows height).
      const k = W / (H * aspect);
      if (d.handle === "n" || d.handle === "s") {
        const w = Math.min((b - t) / k, 1);
        const cx = (o.x + o.x + o.w) / 2;
        l = clamp(cx - w / 2, 0, 1 - w);
        r = l + w;
        const h = w * k;
        if (d.handle === "n") t = b - h;
        else b = t + h;
      } else {
        let w = r - l;
        let h = w * k;
        const room = d.handle.includes("n") ? b : 1 - t;
        if (h > room) {
          h = room;
          w = h / k;
          if (d.handle.includes("w")) l = r - w;
          else r = l + w;
        }
        if (d.handle.includes("n")) t = b - h;
        else b = t + h;
      }
    }
    setCrop({ x: l, y: t, w: r - l, h: b - t });
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ width, crop: canCrop && !isFull(crop) ? crop : null, img });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title="Resize & crop image" description={canCrop ? "Drag the corners or edges to crop. Drag inside the box to move it." : "This image is linked from another site, so it can be resized but not cropped."} className="sm:w-[min(980px,calc(100vw-32px))]">
        {canCrop && (
          <div className="mb-3 flex flex-wrap items-center gap-1" role="group" aria-label="Crop shape">
            <CropIcon className="mr-1 size-4 text-muted" aria-hidden />
            {ASPECTS.map((a) => (
              <Button
                key={a.label}
                size="sm"
                variant="ghost"
                aria-pressed={aspect === a.ratio}
                disabled={!img}
                className={cn(aspect === a.ratio && "bg-wash text-fg-hi")}
                onClick={() => {
                  setAspect(a.ratio);
                  if (a.ratio && img) setCrop(centred(a.ratio, W, H));
                }}
              >
                {a.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              disabled={isFull(crop)}
              onClick={() => {
                setCrop(FULL);
                setAspect(null);
              }}
            >
              <RotateCcw /> Reset crop
            </Button>
            <span className="ml-auto font-mono text-xs text-muted">{img ? `${croppedW} × ${Math.round(crop.h * H)} px` : ""}</span>
          </div>
        )}

        <div className="grid place-items-center rounded-[8px] bg-[repeating-conic-gradient(var(--wash)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-3">
          {img ? (
            <div ref={surface} className="relative max-w-full touch-none select-none overflow-hidden" style={{ aspectRatio: `${W} / ${H}`, width: `min(100%, calc(46vh * ${W / H}))` }} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the user's upload */}
              <img src={src} alt="" className="block size-full" draggable={false} />
              {canCrop && (
                <div
                  data-testid="crop-box"
                  data-handle="move"
                  className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]"
                  style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
                  onPointerDown={onDown}
                >
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                    {Array.from({ length: 9 }, (_, i) => (
                      <div key={i} className="border border-white/25" />
                    ))}
                  </div>
                  {HANDLES.map((h) => (
                    <span
                      key={h}
                      data-handle={h}
                      aria-hidden
                      onPointerDown={onDown}
                      className={cn(
                        "absolute size-4 rounded-full border-2 border-black/40 bg-white",
                        h.includes("n") ? "-top-2" : h.includes("s") ? "-bottom-2" : "top-1/2 -mt-2",
                        h.includes("w") ? "-left-2" : h.includes("e") ? "-right-2" : "left-1/2 -ml-2",
                        h === "n" || h === "s" ? "cursor-ns-resize" : h === "e" || h === "w" ? "cursor-ew-resize" : h === "ne" || h === "sw" ? "cursor-nesw-resize" : "cursor-nwse-resize",
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="py-16 text-[13px] text-muted">Loading…</p>
          )}
        </div>

        <fieldset className="mt-4">
          <legend className="mb-1.5 text-xs font-[510] text-muted">Size in the SOP</legend>
          <div className="flex flex-wrap items-center gap-1">
            {SIZES.map((s) => (
              <Button key={s.label} size="sm" variant="ghost" aria-pressed={shownWidth === s.width} className={cn(shownWidth === s.width && "bg-wash text-fg-hi")} onClick={() => setWidth(s.width)}>
                {s.label}
              </Button>
            ))}
            <label className="ml-2 flex min-w-[220px] flex-1 items-center gap-2 text-xs text-muted">
              <span className="sr-only">Width in pixels</span>
              <input type="range" min={120} max={1200} step={10} value={shownWidth ?? 1200} onChange={(e) => setWidth(Number(e.target.value))} className="flex-1 accent-[var(--cta)]" aria-label="Width in pixels" />
              <span className="w-24 text-right font-mono">{shownWidth ? `${shownWidth} px` : "Full width"}</span>
            </label>
          </div>
        </fieldset>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!img || saving} onClick={save}>
            {saving ? "Saving…" : "Apply"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
