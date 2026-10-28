"use client";

import { Camera, Download, FileText, ImagePlus, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addConfigAction, deleteGearAction, logFirmwareAction, readConfigAction, removeConfigAction, saveGearAction } from "@/app/actions/gear";
import { Ago } from "@/components/local-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import type { Attachment } from "@/db/schema";
import { formatDay } from "@/lib/format";
import { GEAR_CATEGORIES, GEAR_STATUSES, GEAR_STATUS_LABEL, filterLines, type GearStatus } from "@/lib/gear";
import { cn } from "@/lib/utils";
import type { GearItem } from "@/server/services/gear";
import { DataTable } from "./data-table";
import { RecordDialog, orNull, type ActionResult, type FieldSpec } from "./record-dialog";
import { uploadAttachment } from "./task-drawer";

const TONE = { in_service: "good", spare: "strong", out_for_repair: "warn", retired: "neutral" } as const;
export const GearStatusBadge = ({ status }: { status: GearStatus }) => <Badge tone={TONE[status]}>{GEAR_STATUS_LABEL[status]}</Badge>;
const asResult = (r: { ok: boolean; error?: string } | undefined): ActionResult => (!r || r.ok ? { ok: true } : { ok: false, error: r.error ?? "Couldn't save" });

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", type: "text", required: true, placeholder: "FOH Console" },
  { name: "category", label: "Category", type: "text", list: [...GEAR_CATEGORIES] },
  { name: "manufacturer", label: "Manufacturer", type: "text" },
  { name: "model", label: "Model", type: "text" },
  { name: "serial", label: "Serial number", type: "text" },
  { name: "assetTag", label: "Asset tag", type: "text", placeholder: "HCC-A-001" },
  { name: "location", label: "Location", type: "text" },
  { name: "status", label: "Status", type: "select", options: GEAR_STATUSES.map((s) => [s, GEAR_STATUS_LABEL[s]]) },
  { name: "ip", label: "IP address", type: "text" },
  { name: "mac", label: "MAC address", type: "text" },
  { name: "purchaseDate", label: "Purchased", type: "date" },
  { name: "warranty", label: "Warranty until", type: "date" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export function GearButton({ item }: { item?: GearItem }) {
  const [open, setOpen] = useState(false);
  const fields = item ? FIELDS : [...FIELDS.slice(0, 8), { name: "firmware", label: "Firmware version", type: "text" as const }, ...FIELDS.slice(8)];
  return (
    <>
      {item ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Pencil /> Edit
        </Button>
      ) : (
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus /> Gear
        </Button>
      )}
      {open && (
        <RecordDialog
          open
          title={item ? `Edit ${item.name}` : "Add gear"}
          fields={fields}
          initial={item ?? { category: "Audio", status: "in_service" }}
          saveLabel={item ? "Save" : "Add gear"}
          onSave={async (v) =>
            asResult(
              await saveGearAction(
                {
                  name: v.name,
                  category: v.category || "Other",
                  manufacturer: v.manufacturer,
                  model: v.model,
                  serial: v.serial,
                  assetTag: v.assetTag,
                  location: v.location,
                  status: v.status as GearStatus,
                  ip: v.ip,
                  mac: v.mac,
                  purchaseDate: orNull(v.purchaseDate),
                  warranty: orNull(v.warranty),
                  notes: v.notes,
                  photos: item?.photos ?? [],
                  ...(item ? {} : { firmware: v.firmware }),
                },
                item?.id,
              ),
            )
          }
          onDelete={item && (async () => asResult(await deleteGearAction(item.id)))}
          confirmDelete={item && `Delete ${item.name} from the inventory, with its firmware history and backups?`}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function GearList({ items }: { items: GearItem[] }) {
  const router = useRouter();
  const [cat, setCat] = useState("");
  const cats = [...new Set(items.map((g) => g.category))].sort();
  const shown = cat ? items.filter((g) => g.category === cat) : items;
  return (
    <DataTable
      label="Gear"
      rows={shown}
      onRow={(g) => router.push(`/gear/${g.id}`)}
      csv="gear-inventory"
      empty="Add your first piece of gear."
      toolbar={
        <div className="flex flex-wrap gap-1" role="group" aria-label="Category">
          {["", ...cats].map((c) => (
            <button key={c || "all"} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", cat === c ? "border-fg-2 bg-wash text-fg-hi" : "border-line text-muted hover:text-fg-hi")}>
              {c || "All"} <span className="text-faint">{c ? items.filter((g) => g.category === c).length : items.length}</span>
            </button>
          ))}
        </div>
      }
      columns={[
        {
          key: "name",
          label: "Name",
          render: (g) => (
            <Link href={`/gear/${g.id}`} onClick={(e) => e.stopPropagation()}>
              {g.name}
              <span className="block text-xs font-normal text-muted">{[g.manufacturer, g.model].filter(Boolean).join(" ")}</span>
            </Link>
          ),
        },
        { key: "category", label: "Category", className: "max-lg:hidden" },
        { key: "serial", label: "Serial #", render: (g) => <span className="font-mono text-xs">{g.serial}</span> },
        { key: "assetTag", label: "Asset tag", render: (g) => <span className="font-mono text-xs">{g.assetTag}</span> },
        {
          key: "firmware",
          label: "Firmware",
          render: (g) => (
            <span className="font-mono text-xs">
              {g.firmware}
              {g.firmwareUpdated && <span className="block font-sans text-muted">{formatDay(g.firmwareUpdated)}</span>}
            </span>
          ),
        },
        { key: "ip", label: "IP", render: (g) => <span className="font-mono text-xs">{g.ip}</span>, className: "max-md:hidden" },
        { key: "location", label: "Location" },
        { key: "status", label: "Status", value: (g) => GEAR_STATUS_LABEL[g.status], render: (g) => <GearStatusBadge status={g.status} /> },
        { key: "configs", label: "Backups", value: (g) => g.configs.length, render: (g) => (g.configs.length ? <span className="inline-flex items-center gap-1 text-xs"><FileText className="size-3" /> {g.configs.length}</span> : <span className="text-faint">—</span>) },
      ]}
    />
  );
}

export function FirmwareSection({ item }: { item: GearItem }) {
  const [pending, start] = useTransition();
  const [version, setVersion] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="grid gap-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await logFirmwareAction(item.id, { version, note });
            if (!res.ok) return void toast.error(res.error);
            toast(`Firmware updated to ${version}`);
            setVersion("");
            setNote("");
          });
        }}
      >
        <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder={`New version, e.g. ${item.firmware || "1.0"}`} aria-label="New firmware version" className="h-8 w-40 font-mono" required />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Firmware note" className="h-8 min-w-40 flex-1" />
        <Button type="submit" size="sm" disabled={pending || !version.trim()}>
          Log update
        </Button>
      </form>
      {item.firmwareHistory.length > 0 ? (
        <ol className="grid gap-1.5 text-[13px]" aria-label="Firmware history">
          {[...item.firmwareHistory].reverse().map((h, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-xs text-fg-hi">
                {h.from || "?"} → {h.to}
              </span>
              <span className="text-xs text-muted">
                {formatDay(h.at)}
                {h.byName && ` · ${h.byName}`}
              </span>
              {h.note && <span className="w-full text-xs text-fg-2">{h.note}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-muted">No updates logged yet.</p>
      )}
    </div>
  );
}

export function ConfigSection({ item }: { item: GearItem }) {
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<GearItem["configs"][number] | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">Upload show files and exported configs before every firmware update. Text configs open in the viewer.</p>
        <input
          ref={ref}
          type="file"
          multiple
          hidden
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (!files.length) return;
            const note = prompt("Note for this backup (optional)", "") ?? "";
            setUploading(true);
            try {
              for (const f of files) {
                const res = await addConfigAction(item.id, { file: await uploadAttachment(f), note });
                if (!res.ok) throw new Error(res.error);
              }
              toast(files.length === 1 ? "Backup saved" : `${files.length} backups saved`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Upload failed");
            } finally {
              setUploading(false);
            }
          }}
        />
        <Button size="sm" variant="primary" disabled={uploading} onClick={() => ref.current?.click()}>
          <Upload /> {uploading ? "Uploading…" : "Upload backup"}
        </Button>
      </div>
      {item.configs.length ? (
        <ul className="grid gap-1" role="list" aria-label="Config backups">
          {[...item.configs].reverse().map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-line px-3 py-2 text-[13px]">
              <FileText className="size-4 shrink-0 text-muted" />
              {c.mime === "text/plain" ? (
                <button type="button" className="min-w-0 truncate font-[510] text-fg-hi hover:underline" onClick={() => setViewing(c)}>
                  {c.name}
                </button>
              ) : (
                <a href={c.url} className="min-w-0 truncate font-[510] text-fg-hi hover:underline">
                  {c.name}
                </a>
              )}
              <span className="text-xs text-muted">
                {c.firmware && (
                  <>
                    fw <span className="font-mono">{c.firmware}</span> ·{" "}
                  </>
                )}
                {c.size > 1048576 ? `${(c.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(c.size / 1024))} KB`} · <Ago iso={c.at} />
                {c.byName && ` · ${c.byName}`}
              </span>
              {c.note && <span className="w-full pl-6 text-xs text-fg-2">{c.note}</span>}
              <span className="flex-1" />
              <Button asChild size="icon-sm" variant="ghost" aria-label={`Download ${c.name}`}>
                <a href={c.url} download={c.name}>
                  <Download />
                </a>
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${c.name}`}
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove the backup “${c.name}”?`)) return;
                  start(async () => {
                    const res = await removeConfigAction(item.id, c.id);
                    if (!res.ok) toast.error(res.error);
                  });
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">No backups yet.</p>
      )}
      {viewing && <ConfigViewer gearId={item.id} backup={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ConfigViewer({ gearId, backup, onClose }: { gearId: string; backup: GearItem["configs"][number]; onClose: () => void }) {
  const [data, setData] = useState<{ text: string; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    let alive = true;
    readConfigAction(gearId, backup.id).then((res) => {
      if (!alive) return;
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [gearId, backup.id]);
  const lines = useMemo(() => (data ? filterLines(data.text, filter) : []), [data, filter]);
  const width = String(data ? data.text.split("\n").length : 1).length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={backup.name} description={backup.firmware ? `Taken on firmware ${backup.firmware}` : undefined} wide className="sm:w-[min(960px,calc(100vw-32px))]">
        <div className="grid gap-2">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter lines (e.g. vlan, ip address)" aria-label="Filter lines" className="h-8 pl-8 font-mono text-xs" />
          </label>
          {error ? (
            <p className="text-[13px] text-bad">{error}</p>
          ) : !data ? (
            <p className="text-[13px] text-muted">Loading…</p>
          ) : (
            <>
              <p className="text-xs text-muted">
                {filter ? `${lines.length} matching line${lines.length === 1 ? "" : "s"}` : `${lines.length} lines`}
                {data.truncated && " · showing the first 2 MB"}
              </p>
              <pre className="max-h-[60vh] overflow-auto rounded-[8px] border border-line bg-bg p-2 font-mono text-[12px] leading-[1.55] text-fg-2" data-testid="config-text">
                {lines.map((l) => (
                  <div key={l.n} className="flex">
                    <span className="mr-3 shrink-0 select-none text-right text-faint" style={{ width: `${width}ch` }}>
                      {l.n}
                    </span>
                    <span className="whitespace-pre">{l.line || " "}</span>
                  </div>
                ))}
              </pre>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GearPhotos({ item }: { item: GearItem }) {
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const save = (photos: Attachment[]) =>
    start(async () => {
      const g = item;
      const res = await saveGearAction(
        { name: g.name, category: g.category, manufacturer: g.manufacturer, model: g.model, serial: g.serial, assetTag: g.assetTag, location: g.location, status: g.status, ip: g.ip, mac: g.mac, purchaseDate: g.purchaseDate, warranty: g.warranty, notes: g.notes, photos },
        g.id,
      );
      if (!res.ok) toast.error(res.error);
    });
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      const added: Attachment[] = [];
      for (const f of Array.from(list)) added.push(await uploadAttachment(f));
      save([...item.photos, ...added]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
        <Button size="sm" disabled={uploading || pending} onClick={() => camera.current?.click()}>
          <Camera /> Take photo
        </Button>
        <Button size="sm" variant="ghost" disabled={uploading || pending} onClick={() => file.current?.click()}>
          <ImagePlus /> {uploading ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {item.photos.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="list">
          {item.photos.map((p, i) => (
            <li key={p.url} className="group relative overflow-hidden rounded-[8px] border border-line">
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded photo */}
                <img src={p.url} alt={p.name} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              </a>
              <Button size="icon-sm" variant="ghost" className="absolute right-1 top-1 bg-bg/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove ${p.name}`} onClick={() => confirm("Remove this photo?") && save(item.photos.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">Photograph the rear panel, serial plate and rack position.</p>
      )}
    </div>
  );
}

