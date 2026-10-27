"use client";

import { Cable as CableIcon, ChevronLeft, ImageUp, Move, Plus, Printer, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { createLayoutAction, deleteLayoutAction, saveLayoutAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { LayoutItem, LayoutRun } from "@/db/schema";
import { DEVICE_TYPES, DEVICE_TYPE_KEYS, type DeviceType } from "@/lib/cabling";
import { cn } from "@/lib/utils";
import type { Layout } from "@/server/services/cabling";
import { LayoutSvg, type LayoutDoc } from "./layout-svg";
import { uploadAttachment } from "./task-drawer";

type Option = { id: string; label: string; type: string };
type GearOption = { id: string; name: string; model: string };
type Drag = { id: string; kind: "move" | "resize"; sx: number; sy: number; ox: number; oy: number };

const SNAP = 5;
const snap = (n: number) => Math.round(n / SNAP) * SNAP;
const newId = () => crypto.randomUUID().slice(0, 8);

export function NewLayoutButton({ projectId }: { projectId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="primary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await createLayoutAction(projectId);
          if (res && !res.ok) toast.error(res.error);
        })
      }
    >
      <Plus /> Layout
    </Button>
  );
}

export function LayoutEditor({ layout, cables, gear }: { layout: Layout; cables: Option[]; gear: GearOption[] }) {
  const [doc, setDoc] = useState<LayoutDoc>({ name: layout.name, backgroundUrl: layout.backgroundUrl, width: layout.width, height: layout.height, items: layout.items, runs: layout.runs });
  const [changed, setChanged] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"move" | "connect">("move");
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [history, setHistory] = useState<LayoutDoc[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Autosave shortly after the last change.
  useEffect(() => {
    if (!changed) return;
    const t = setTimeout(async () => {
      setStatus("saving");
      const res = await saveLayoutAction(layout.id, doc);
      setStatus(res.ok ? "saved" : "error");
      if (!res.ok) toast.error(res.error);
    }, 700);
    return () => clearTimeout(t);
  }, [doc, changed, layout.id]);

  useEffect(() => {
    if (status === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  const remember = () => setHistory((h) => [...h.slice(-49), doc]);
  const update = (fn: (d: LayoutDoc) => LayoutDoc, record = true) => {
    if (record) remember();
    setDoc(fn);
    setChanged(true);
    setStatus("saving");
  };
  const undoLast = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory(history.slice(0, -1));
    setDoc(prev);
    setChanged(true);
    setStatus("saving");
  };

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };

  const onItemDown = (e: ReactPointerEvent, item: LayoutItem) => {
    e.stopPropagation();
    if (mode === "connect") {
      if (!connectFrom) return setConnectFrom(item.id);
      if (connectFrom !== item.id) {
        const run: LayoutRun = { id: newId(), from: connectFrom, to: item.id, label: "", color: "#5e8bd6", style: "straight" };
        update((d) => ({ ...d, runs: [...d.runs, run] }));
        setSel(run.id);
      }
      setConnectFrom(null);
      return;
    }
    setSel(item.id);
    const p = toSvg(e);
    remember();
    drag.current = { id: item.id, kind: "move", sx: p.x, sy: p.y, ox: item.x, oy: item.y };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onResizeDown = (e: ReactPointerEvent, item: LayoutItem) => {
    e.stopPropagation();
    const p = toSvg(e);
    remember();
    drag.current = { id: item.id, kind: "resize", sx: p.x, sy: p.y, ox: item.w ?? 200, oy: item.h ?? 120 };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const p = toSvg(e);
    const dx = p.x - g.sx;
    const dy = p.y - g.sy;
    update(
      (d) => ({
        ...d,
        items: d.items.map((i) =>
          i.id !== g.id
            ? i
            : g.kind === "move"
              ? { ...i, x: Math.max(0, Math.min(d.width, snap(g.ox + dx))), y: Math.max(0, Math.min(d.height, snap(g.oy + dy))) }
              : { ...i, w: Math.max(40, snap(g.ox + dx)), h: Math.max(30, snap(g.oy + dy)) },
        ),
      }),
      false,
    );
  };

  const selItem = doc.items.find((i) => i.id === sel);
  const selRun = doc.runs.find((r) => r.id === sel);
  const setItem = (patch: Partial<LayoutItem>) => update((d) => ({ ...d, items: d.items.map((i) => (i.id === sel ? { ...i, ...patch } : i)) }));
  const setRun = (patch: Partial<LayoutRun>) => update((d) => ({ ...d, runs: d.runs.map((r) => (r.id === sel ? { ...r, ...patch } : r)) }));
  const removeSelected = () => {
    if (!sel) return;
    update((d) => ({ ...d, items: d.items.filter((i) => i.id !== sel), runs: d.runs.filter((r) => r.id !== sel && r.from !== sel && r.to !== sel) }));
    setSel(null);
  };
  const add = (type: DeviceType) => {
    const n = doc.items.filter((i) => i.type === type).length + 1;
    const item: LayoutItem =
      type === "zone"
        ? { id: newId(), type, label: `ROOM ${n}`, x: snap(doc.width / 2 - 100), y: snap(doc.height / 2 - 60), w: 200, h: 120 }
        : { id: newId(), type, label: `${DEVICE_TYPES[type][0]} ${n}`, x: snap(doc.width / 2), y: snap(doc.height / 2) };
    update((d) => ({ ...d, items: [...d.items, item] }));
    setSel(item.id);
    setMode("move");
  };
  const uploadPlan = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Upload the floor plan as an image (PNG or JPEG).");
    setUploading(true);
    try {
      const up = await uploadAttachment(file);
      const img = new Image();
      img.src = up.url;
      await img.decode();
      const height = Math.max(200, Math.min(10_000, Math.round((1000 * img.naturalHeight) / img.naturalWidth)));
      update((d) => ({ ...d, backgroundUrl: up.url, width: 1000, height }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  const itemName = (id: string) => doc.items.find((i) => i.id === id)?.label || "?";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/projects/${layout.projectId}/layouts`}>
            <ChevronLeft /> Layouts
          </Link>
        </Button>
        <Input value={doc.name} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} aria-label="Layout name" className="h-8 max-w-64 font-[510]" />
        <span className={cn("text-xs", status === "error" ? "text-bad" : "text-faint")} role="status">
          {status === "saving" ? "Saving…" : status === "error" ? "Not saved" : "Saved"}
        </span>
        <span className="flex-1" />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => (uploadPlan(e.target.files?.[0]), (e.target.value = ""))} />
        <Button size="sm" variant="ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <ImageUp /> {uploading ? "Uploading…" : doc.backgroundUrl ? "Replace floor plan" : "Floor plan"}
        </Button>
        {doc.backgroundUrl && (
          <Button size="sm" variant="ghost" onClick={() => update((d) => ({ ...d, backgroundUrl: null }))}>
            Clear plan
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Delete layout"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete the layout “${doc.name}”?`)) return;
            start(async () => {
              const res = await deleteLayoutAction(layout.id, layout.projectId);
              if (res && !res.ok) toast.error(res.error);
            });
          }}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="inline-flex rounded-[6px] border border-line p-0.5" role="group" aria-label="Mode">
          {(
            [
              ["move", "Move", <Move key="m" />],
              ["connect", "Connect", <CableIcon key="c" />],
            ] as const
          ).map(([m, label, icon]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => (setMode(m), setConnectFrom(null))} className={cn("flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[12.5px] [&_svg]:size-3.5", mode === m ? "bg-wash text-fg-hi" : "text-muted hover:text-fg-hi")}>
              {icon} {label}
            </button>
          ))}
        </div>
        <Select value="" onChange={(e) => e.target.value && add(e.target.value as DeviceType)} aria-label="Add device" className="h-8 w-auto md:text-[13px]">
          <option value="">+ Add device…</option>
          {DEVICE_TYPE_KEYS.map((k) => (
            <option key={k} value={k}>
              {DEVICE_TYPES[k][0]}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="ghost" disabled={!history.length} onClick={undoLast} aria-label="Undo">
          <Undo2 /> Undo
        </Button>
        {mode === "connect" && <span className="text-xs text-muted">{connectFrom ? `From ${itemName(connectFrom)}: now tap the other end.` : "Tap the device where the cable starts."}</span>}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <div
          tabIndex={0}
          className="overflow-hidden rounded-[12px] border border-line outline-none focus-visible:border-fg-2 print:border-0"
          onKeyDown={(e) => {
            if ((e.key === "Delete" || e.key === "Backspace") && sel) {
              e.preventDefault();
              removeSelected();
            } else if (e.key === "Escape") {
              setSel(null);
              setConnectFrom(null);
            } else if ((e.metaKey || e.ctrlKey) && e.key === "z") {
              e.preventDefault();
              undoLast();
            } else if (selItem && e.key.startsWith("Arrow")) {
              e.preventDefault();
              const step = e.shiftKey ? 20 : SNAP;
              const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0];
              setItem({ x: selItem.x + dx, y: selItem.y + dy });
            }
          }}
        >
          <LayoutSvg
            doc={doc}
            selected={sel}
            connectFrom={connectFrom}
            svgRef={svgRef}
            className="touch-none"
            onItemDown={onItemDown}
            onResizeDown={onResizeDown}
            onRunDown={(e, r) => {
              e.stopPropagation();
              setSel(r.id);
            }}
            svgProps={{
              onPointerMove: onMove,
              onPointerUp: () => (drag.current = null),
              onPointerCancel: () => (drag.current = null),
              onPointerDown: () => {
                setSel(null);
                setConnectFrom(null);
              },
            }}
          />
        </div>

        <aside className="grid content-start gap-4 rounded-[12px] border border-line bg-surface p-4 print:hidden" aria-label="Properties">
          {selItem ? (
            <>
              <h3 className="text-[14px] font-[510]">{DEVICE_TYPES[selItem.type as DeviceType]?.[0] ?? "Item"}</h3>
              <Field label="Label" htmlFor="li-label">
                <Input id="li-label" value={selItem.label} onChange={(e) => setItem({ label: e.target.value })} className="h-8" />
              </Field>
              {selItem.type !== "zone" && (
                <>
                  <Field label="Type" htmlFor="li-type">
                    <Select id="li-type" value={selItem.type} onChange={(e) => setItem({ type: e.target.value })} className="h-8">
                      {DEVICE_TYPE_KEYS.filter((k) => k !== "zone").map((k) => (
                        <option key={k} value={k}>
                          {DEVICE_TYPES[k][0]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Linked gear" htmlFor="li-gear" hint={gear.length ? undefined : "Add gear to the inventory to link it here."}>
                    <Select id="li-gear" value={selItem.gearId ?? ""} onChange={(e) => setItem({ gearId: e.target.value || undefined })} className="h-8">
                      <option value="">None</option>
                      {gear.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                          {g.model ? ` (${g.model})` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {selItem.gearId && (
                    <Link href={`/gear/${selItem.gearId}`} className="text-xs text-fg-2 underline decoration-line-2 underline-offset-2">
                      Open gear record
                    </Link>
                  )}
                </>
              )}
              <Button size="sm" variant="danger" onClick={removeSelected} className="justify-self-start">
                <Trash2 /> Remove
              </Button>
            </>
          ) : selRun ? (
            <>
              <h3 className="text-[14px] font-[510]">Cable run</h3>
              <p className="-mt-2 text-xs text-muted">
                {itemName(selRun.from)} → {itemName(selRun.to)}
              </p>
              <Field label="Cable from the schedule" htmlFor="lr-cable">
                <Select
                  id="lr-cable"
                  value={selRun.cableId ?? ""}
                  onChange={(e) => {
                    const c = cables.find((x) => x.id === e.target.value);
                    setRun({ cableId: c?.id, label: c && !selRun.label ? c.label : selRun.label });
                  }}
                  className="h-8"
                >
                  <option value="">None</option>
                  {cables.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} · {c.type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Label" htmlFor="lr-label">
                <Input id="lr-label" value={selRun.label} onChange={(e) => setRun({ label: e.target.value })} className="h-8 font-mono" />
              </Field>
              <div className="grid grid-cols-[auto_1fr] gap-3">
                <Field label="Colour" htmlFor="lr-color">
                  <Input id="lr-color" type="color" value={selRun.color ?? "#a3a3a3"} onChange={(e) => setRun({ color: e.target.value })} className="h-8 w-14 cursor-pointer px-1" />
                </Field>
                <Field label="Path" htmlFor="lr-style">
                  <Select id="lr-style" value={selRun.style ?? "straight"} onChange={(e) => setRun({ style: e.target.value as "straight" | "elbow" })} className="h-8">
                    <option value="straight">Straight</option>
                    <option value="elbow">Right angle</option>
                  </Select>
                </Field>
              </div>
              <Button size="sm" variant="danger" onClick={removeSelected} className="justify-self-start">
                <Trash2 /> Remove run
              </Button>
            </>
          ) : (
            <p className="text-[13px] text-muted">
              Drag devices to move them; drag a room&apos;s corner to resize it. Choose <b className="font-[510] text-fg-2">Connect</b>, then tap two devices to draw a cable run. Arrow keys nudge, Delete removes.
            </p>
          )}
          <div>
            <h3 className="mb-2 text-xs font-[510] text-muted">Legend</h3>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-fg-2" role="list">
              {DEVICE_TYPE_KEYS.filter((k) => k !== "zone").map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-full border border-fg-2 bg-surface-3 text-[10px] font-[600] text-fg-hi">{DEVICE_TYPES[k][1]}</span>
                  {DEVICE_TYPES[k][0]}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
