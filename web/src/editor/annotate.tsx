"use client";

import { ArrowUpRight, EyeOff, Hash, Loader2, MousePointer2, ScanSearch, Square, Trash2, Type, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { toast } from "sonner";
import type { Annotation } from "@/blocks/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { findSensitive, type OcrLine } from "./sensitive";

type Tool = "select" | "arrow" | "box" | "blur" | "marker" | "text";
const COLORS = ["#ef4444", "#facc15", "#22c55e", "#ffffff", "#111111"];
const TOOLS: { id: Tool; label: string; icon: typeof Square; key: string }[] = [
  { id: "select", label: "Select and move", icon: MousePointer2, key: "v" },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight, key: "a" },
  { id: "box", label: "Box", icon: Square, key: "r" },
  { id: "blur", label: "Blur", icon: EyeOff, key: "b" },
  { id: "marker", label: "Numbered marker", icon: Hash, key: "n" },
  { id: "text", label: "Text", icon: Type, key: "t" },
];

/** Normalised (0–1) rectangle of an annotation, whatever direction it was drawn in. */
const rectOf = (a: Annotation) => ({ x: Math.min(a.x, a.x + a.w), y: Math.min(a.y, a.y + a.h), w: Math.abs(a.w), h: Math.abs(a.h) });

/** Draws annotations onto a canvas at the image's real size. Blur is pixelation, so it can't be undone from the PNG. */
export function flatten(img: HTMLImageElement, annotations: Annotation[]): HTMLCanvasElement {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const unit = Math.max(2, Math.round(Math.max(W, H) / 400));
  for (const a of annotations.filter((x) => x.kind === "blur")) {
    const r = rectOf(a);
    const [x, y, w, h] = [Math.round(r.x * W), Math.round(r.y * H), Math.max(1, Math.round(r.w * W)), Math.max(1, Math.round(r.h * H))];
    const block = Math.max(6, Math.round(Math.min(w, h) / 3));
    const tmp = document.createElement("canvas");
    tmp.width = Math.max(1, Math.ceil(w / block));
    tmp.height = Math.max(1, Math.ceil(h / block));
    const t = tmp.getContext("2d")!;
    t.drawImage(c, x, y, w, h, 0, 0, tmp.width, tmp.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
  }
  for (const a of annotations.filter((x) => x.kind !== "blur")) {
    const color = a.color ?? COLORS[0];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = unit * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (a.kind === "box") {
      const r = rectOf(a);
      ctx.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H);
    } else if (a.kind === "arrow") {
      const [x0, y0, x1, y1] = [a.x * W, a.y * H, (a.x + a.w) * W, (a.y + a.h) * H];
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const head = unit * 9;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1 - Math.cos(ang) * head * 0.6, y1 - Math.sin(ang) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - head * Math.cos(ang - 0.45), y1 - head * Math.sin(ang - 0.45));
      ctx.lineTo(x1 - head * Math.cos(ang + 0.45), y1 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    } else if (a.kind === "marker") {
      const rad = unit * 11;
      ctx.beginPath();
      ctx.arc(a.x * W, a.y * H, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color === "#ffffff" || color === "#facc15" ? "#111111" : "#ffffff";
      ctx.font = `600 ${rad * 1.15}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(a.n ?? 1), a.x * W, a.y * H + unit * 0.5);
    } else if (a.kind === "text" && a.text) {
      const size = unit * 14;
      ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      const pad = unit * 4;
      const tw = ctx.measureText(a.text).width;
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.fillRect(a.x * W, a.y * H, tw + pad * 2, size + pad * 2);
      ctx.fillStyle = color === "#111111" ? "#ffffff" : color;
      ctx.fillText(a.text, a.x * W + pad, a.y * H + pad);
    }
  }
  return c;
}

/** Runs OCR in the browser (self-hosted Tesseract) and returns blur annotations for secret-looking text. */
async function detectSensitive(img: HTMLImageElement): Promise<Annotation[]> {
  const { createWorker, OEM } = await import("tesseract.js");
  const worker = await createWorker("eng", OEM.LSTM_ONLY, { workerPath: "/vendor/tesseract/worker.min.js", corePath: "/vendor/tesseract/core", langPath: "/vendor/tesseract/lang", gzip: true });
  try {
    const { data } = await worker.recognize(img, {}, { blocks: true });
    const lines: OcrLine[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ words: l.words.map((w) => ({ text: w.text, bbox: w.bbox })) }))));
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    return findSensitive(lines).map((b) => ({ kind: "blur" as const, x: b.x0 / W, y: b.y0 / H, w: (b.x1 - b.x0) / W, h: (b.y1 - b.y0) / H, auto: true }));
  } finally {
    await worker.terminate();
  }
}

export function AnnotateDialog({
  open,
  src,
  initial,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  /** The original, unannotated image (same origin, so the canvas can be exported). */
  src: string;
  initial: Annotation[];
  onOpenChange: (o: boolean) => void;
  onSave: (png: Blob, annotations: Annotation[]) => Promise<void>;
}) {
  const [items, setItems] = useState<Annotation[]>(initial);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: { x: number; y: number }; moving?: { index: number; orig: Annotation } } | null>(null);

  const commit = useCallback((next: Annotation[]) => {
    setHistory((h) => [...h.slice(-49), items]);
    setItems(next);
  }, [items]);

  const scan = useCallback(
    async (image: HTMLImageElement, current: Annotation[]) => {
      setScanning(true);
      try {
        const found = await detectSensitive(image);
        const kept = current.filter((a) => !a.auto);
        setItems([...kept, ...found]);
        toast(found.length ? `Blurred ${found.length} area${found.length === 1 ? "" : "s"} that look like passwords or account numbers. Check them.` : "No passwords or account numbers found.");
      } catch {
        toast.error("Couldn't scan the image for sensitive text.");
      } finally {
        setScanning(false);
      }
    },
    [],
  );

  // Load the image; on a first annotation, scan for secrets straight away (blur is on by default).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const i = new Image();
    i.onload = () => {
      if (!alive) return;
      setImg(i);
      if (!initial.length) void scan(i, []);
    };
    i.onerror = () => alive && toast.error("Couldn't load the image.");
    i.src = src;
    return () => {
      alive = false;
    };
  }, [open, src, initial.length, scan]);

  const point = (e: RPointerEvent) => {
    const r = surface.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const hitTest = (p: { x: number; y: number }) => {
    for (let i = items.length - 1; i >= 0; i--) {
      const a = items[i];
      if (a.kind === "marker" || a.kind === "text") {
        if (Math.abs(p.x - a.x) < 0.04 && Math.abs(p.y - a.y) < 0.04) return i;
        continue;
      }
      const r = rectOf(a);
      if (p.x >= r.x - 0.01 && p.x <= r.x + r.w + 0.01 && p.y >= r.y - 0.01 && p.y <= r.y + r.h + 0.01) return i;
    }
    return null;
  };

  const down = (e: RPointerEvent) => {
    const p = point(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool === "select") {
      const i = hitTest(p);
      setSelected(i);
      if (i !== null) drag.current = { start: p, moving: { index: i, orig: items[i] } };
      return;
    }
    if (tool === "marker") {
      const n = Math.max(0, ...items.filter((a) => a.kind === "marker").map((a) => a.n ?? 0)) + 1;
      commit([...items, { kind: "marker", x: p.x, y: p.y, w: 0, h: 0, n, color }]);
      return;
    }
    if (tool === "text") {
      const text = prompt("Text")?.trim();
      if (text) commit([...items, { kind: "text", x: p.x, y: p.y, w: 0, h: 0, text: text.slice(0, 500), color }]);
      return;
    }
    drag.current = { start: p };
    setDraft({ kind: tool, x: p.x, y: p.y, w: 0, h: 0, color });
  };

  const move = (e: RPointerEvent) => {
    if (!drag.current) return;
    const p = point(e);
    const { start, moving } = drag.current;
    if (moving) {
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      setItems((list) => list.map((a, i) => (i === moving.index ? { ...moving.orig, x: moving.orig.x + dx, y: moving.orig.y + dy } : a)));
    } else setDraft((d) => (d ? { ...d, w: p.x - start.x, h: p.y - start.y } : d));
  };

  const up = () => {
    if (drag.current?.moving) setHistory((h) => [...h.slice(-49), items.map((a, i) => (i === drag.current!.moving!.index ? drag.current!.moving!.orig : a))]);
    drag.current = null;
    if (draft && (Math.abs(draft.w) > 0.01 || Math.abs(draft.h) > 0.01)) commit([...items, draft]);
    setDraft(null);
  };

  const removeSelected = useCallback(() => {
    if (selected === null) return;
    commit(items.filter((_, i) => i !== selected));
    setSelected(null);
  }, [selected, items, commit]);

  const undo = useCallback(() => {
    if (!history.length) return;
    setItems(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  }, [history]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      if ((e.key === "Backspace" || e.key === "Delete") && selected !== null) {
        e.preventDefault();
        removeSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undo();
      } else {
        const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
        if (t && !e.metaKey && !e.ctrlKey) setTool(t.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selected, removeSelected, undo]);

  const save = async () => {
    if (!img) return;
    setSaving(true);
    try {
      const canvas = flatten(img, items);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("export failed");
      await onSave(blob, items);
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save the annotated image.");
    } finally {
      setSaving(false);
    }
  };

  const all = draft ? [...items, draft] : items;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title="Annotate screenshot" description="Draw arrows, boxes and numbered markers. Blur hides passwords and account numbers; areas found automatically are marked with a dashed outline." className="sm:w-[min(1100px,calc(100vw-32px))]">
        <div className="mb-3 flex flex-wrap items-center gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              aria-pressed={tool === t.id}
              title={`${t.label} (${t.key.toUpperCase()})`}
              className={cn("grid size-8 place-items-center rounded-[6px] text-muted hover:bg-wash hover:text-fg-hi", tool === t.id && "bg-wash text-fg-hi")}
            >
              <t.icon className="size-4" />
              <span className="sr-only">{t.label}</span>
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-line" />
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} className={cn("size-6 rounded-full border-2", color === c ? "border-fg-hi" : "border-transparent")}>
              <span className="block size-full rounded-full border border-black/30" style={{ background: c }} />
            </button>
          ))}
          <span className="flex-1" />
          <Button size="sm" variant="ghost" disabled={!img || scanning} onClick={() => img && scan(img, items)}>
            {scanning ? <Loader2 className="animate-spin" /> : <ScanSearch />} {scanning ? "Scanning…" : "Find secrets"}
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Undo" disabled={!history.length} onClick={undo}>
            <Undo2 />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Delete selected" disabled={selected === null} onClick={removeSelected}>
            <Trash2 />
          </Button>
        </div>
        <div className="grid place-items-center overflow-auto rounded-[8px] bg-black/40 p-2">
          {img ? (
            <div
              ref={surface}
              className={cn("relative touch-none select-none", tool === "select" ? "cursor-default" : "cursor-crosshair")}
              style={{ width: "100%", maxWidth: img.naturalWidth, aspectRatio: `${img.naturalWidth} / ${img.naturalHeight}` }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- the uploaded screenshot being annotated */}
              <img src={src} alt="" className="absolute inset-0 size-full" draggable={false} />
              <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                <defs>
                  <marker id="hcc-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
                  </marker>
                </defs>
                {all.map((a, i) => {
                  const r = rectOf(a);
                  const sel = i === selected;
                  const c = a.color ?? COLORS[0];
                  if (a.kind === "blur")
                    return <rect key={i} x={r.x * 1000} y={r.y * 1000} width={r.w * 1000} height={r.h * 1000} fill="rgba(120,120,120,0.55)" stroke={sel ? "#fff" : a.auto ? "#facc15" : "rgba(255,255,255,0.6)"} strokeDasharray={a.auto ? "6 4" : undefined} vectorEffect="non-scaling-stroke" strokeWidth={sel ? 2 : 1.5} />;
                  if (a.kind === "box") return <rect key={i} x={r.x * 1000} y={r.y * 1000} width={r.w * 1000} height={r.h * 1000} fill="none" stroke={c} strokeWidth={sel ? 4 : 3} vectorEffect="non-scaling-stroke" />;
                  if (a.kind === "arrow") return <line key={i} x1={a.x * 1000} y1={a.y * 1000} x2={(a.x + a.w) * 1000} y2={(a.y + a.h) * 1000} stroke={c} strokeWidth={sel ? 4 : 3} vectorEffect="non-scaling-stroke" markerEnd="url(#hcc-arrowhead)" />;
                  return null;
                })}
              </svg>
              {all.map((a, i) =>
                a.kind === "marker" ? (
                  <span
                    key={i}
                    className={cn("pointer-events-none absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[13px] font-[600]", i === selected && "ring-2 ring-white")}
                    style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, background: a.color ?? COLORS[0], color: a.color === "#ffffff" || a.color === "#facc15" ? "#111" : "#fff" }}
                  >
                    {a.n}
                  </span>
                ) : a.kind === "text" ? (
                  <span key={i} className={cn("pointer-events-none absolute whitespace-nowrap rounded-[3px] bg-black/70 px-1.5 py-0.5 text-[13px] font-[600]", i === selected && "ring-2 ring-white")} style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, color: a.color === "#111111" ? "#fff" : a.color }}>
                    {a.text}
                  </span>
                ) : null,
              )}
            </div>
          ) : (
            <div className="h-64 w-full animate-pulse rounded-[6px] bg-wash-2" />
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-faint">V select · A arrow · R box · B blur · N marker · T text · ⌫ delete · ⌘Z undo</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!img || saving || scanning} onClick={save}>
              {saving ? "Saving…" : "Save image"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
