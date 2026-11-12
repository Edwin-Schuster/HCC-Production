"use client";

import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deleteRoomAction,
  deleteServiceAction,
  moveRoomAction,
  moveServiceAction,
  saveRoomAction,
  saveServiceAction,
  saveSiteTextAction,
  setGearPublicAction,
} from "@/app/actions/public-site";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { GEAR_GROUPS, type GearGroup } from "@/lib/public-site";
import { cn } from "@/lib/utils";
import type { SiteForEditing } from "@/server/services/public-site";

type Service = SiteForEditing["services"][number];
type Room = SiteForEditing["rooms"][number];
type GearRow = SiteForEditing["gear"][number];
type LayoutOpt = SiteForEditing["layouts"][number];

function Section({ id, title, view, children, action }: { id: string; title: string; view?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-[12px] border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id={id} className="mr-auto text-[15px] font-[510]">
          {title}
        </h2>
        {view && (
          <Button asChild size="sm" variant="ghost">
            <Link href={view} target="_blank">
              <ExternalLink /> View
            </Link>
          </Button>
        )}
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------- Home and guest page text ----------

export function SiteTextEditor({ text, field }: { text: SiteForEditing["text"]; field: "home" | "guests" }) {
  const [pending, start] = useTransition();
  return (
    <Section id={`${field}-h`} title={field === "home" ? "Home page" : "For guest presenters & bands"} view={field === "home" ? "/welcome" : "/guests"}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const s = (k: string) => String(fd.get(k) ?? "");
          start(async () => {
            const res = await saveSiteTextAction({ heroTitle: field === "home" ? s("heroTitle") : text.heroTitle, heroIntro: field === "home" ? s("heroIntro") : text.heroIntro, guestsBody: field === "guests" ? s("guestsBody") : text.guestsBody });
            if (res.ok) toast("Saved");
            else toast.error(res.error);
          });
        }}
      >
        {field === "home" ? (
          <>
            <Field label="Title" htmlFor="site-title">
              <Input id="site-title" name="heroTitle" defaultValue={text.heroTitle} required maxLength={120} />
            </Field>
            <Field label="Intro" htmlFor="site-intro" hint="Markdown: **bold**, *italic*, links.">
              <Textarea id="site-intro" name="heroIntro" defaultValue={text.heroIntro} rows={4} />
            </Field>
          </>
        ) : (
          <Field label="Page text" htmlFor="site-guests" hint="Markdown: ## headings, - lists, 1. numbered lists, **bold**.">
            <Textarea id="site-guests" name="guestsBody" defaultValue={text.guestsBody} rows={16} className="font-mono text-[13px]" />
          </Field>
        )}
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

// ---------- Service cards ----------

function MoveButtons({ onMove, first, last, label }: { onMove: (dir: -1 | 1) => void; first: boolean; last: boolean; label: string }) {
  return (
    <>
      <Button size="icon-sm" variant="ghost" aria-label={`Move ${label} up`} disabled={first} onClick={() => onMove(-1)}>
        <ArrowUp />
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label={`Move ${label} down`} disabled={last} onClick={() => onMove(1)}>
        <ArrowDown />
      </Button>
    </>
  );
}

export function ServicesEditor({ services }: { services: Service[] }) {
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [, start] = useTransition();
  return (
    <Section
      id="svc-h"
      title="What we do"
      view="/what-we-do"
      action={
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Service
        </Button>
      }
    >
      <ul className="grid gap-2" role="list">
        {services.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 rounded-[8px] border border-line px-3 py-2">
            {s.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- an uploaded photo
              <img src={s.photoUrl} alt="" className="size-10 shrink-0 rounded-[6px] object-cover" />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-[6px] bg-wash text-faint" aria-hidden>
                <ImagePlus className="size-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-fg-hi">{s.title}</p>
              <p className="truncate text-[12.5px] text-muted">{s.body}</p>
            </div>
            <MoveButtons label={s.title} first={i === 0} last={i === services.length - 1} onMove={(dir) => start(async () => void (await moveServiceAction(s.id, dir)))} />
            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${s.title}`} onClick={() => setEditing(s)}>
              <Pencil />
            </Button>
          </li>
        ))}
      </ul>
      {editing && <ServiceDialog service={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

function ServiceDialog({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [photo, setPhoto] = useState<string | null>(service?.photoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch("/api/files", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({ error: "Upload failed." }));
    setUploading(false);
    if (!r.ok) return void toast.error(j.error);
    setPhoto(j.url);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={service ? service.title : "Add a service"}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const res = await saveServiceAction({ title: String(fd.get("title")), body: String(fd.get("body") ?? ""), photoUrl: photo }, service?.id);
              if (!res.ok) return void toast.error(res.error);
              onClose();
            });
          }}
        >
          <Field label="Title" htmlFor="svc-title">
            <Input id="svc-title" name="title" defaultValue={service?.title} required maxLength={120} autoFocus />
          </Field>
          <Field label="Description" htmlFor="svc-body">
            <Textarea id="svc-body" name="body" defaultValue={service?.body} maxLength={1000} rows={3} />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-[510] text-muted">Photo (optional)</p>
            <div className="flex items-center gap-3">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- an uploaded photo
                <img src={photo} alt="" className="h-16 w-28 rounded-[6px] border border-line object-cover" />
              ) : (
                <span className="grid h-16 w-28 place-items-center rounded-[6px] border border-dashed border-line text-xs text-faint">No photo</span>
              )}
              <Button type="button" size="sm" disabled={uploading} onClick={() => file.current?.click()}>
                <ImagePlus /> {uploading ? "Uploading…" : photo ? "Replace" : "Upload"}
              </Button>
              {photo && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setPhoto(null)}>
                  <X /> Remove
                </Button>
              )}
              <input ref={file} type="file" accept="image/*" hidden aria-label="Photo" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {service && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove “${service.title}” from What we do?`)) return;
                  start(async () => {
                    const res = await deleteServiceAction(service.id);
                    if (res.ok) onClose();
                    else toast.error(res.error);
                  });
                }}
              >
                <Trash2 /> Remove
              </Button>
            )}
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending || uploading}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Rooms ----------

export function RoomsEditor({ rooms, layouts }: { rooms: Room[]; layouts: LayoutOpt[] }) {
  const [editing, setEditing] = useState<Room | "new" | null>(null);
  const [, start] = useTransition();
  const layoutName = (id: string | null) => {
    const l = layouts.find((x) => x.id === id);
    return l ? `${l.name} (${l.project})` : null;
  };
  return (
    <Section
      id="rooms-h"
      title="Rooms"
      view="/gear-at-hope"
      action={
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Room
        </Button>
      }
    >
      <ul className="grid gap-2" role="list">
        {rooms.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3 rounded-[8px] border border-line px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-fg-hi">{r.name}</p>
              <p className="truncate text-[12.5px] text-muted">{[layoutName(r.layoutId) && `Stage plot: ${layoutName(r.layoutId)}`, r.notes && "Has tech packet notes"].filter(Boolean).join(" · ") || "No stage plot or notes yet"}</p>
            </div>
            <MoveButtons label={r.name} first={i === 0} last={i === rooms.length - 1} onMove={(dir) => start(async () => void (await moveRoomAction(r.id, dir)))} />
            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
              <Pencil />
            </Button>
          </li>
        ))}
      </ul>
      {editing && <RoomDialog room={editing === "new" ? null : editing} layouts={layouts} onClose={() => setEditing(null)} />}
    </Section>
  );
}

function RoomDialog({ room, layouts, onClose }: { room: Room | null; layouts: LayoutOpt[]; onClose: () => void }) {
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={room ? room.name : "Add a room"}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const res = await saveRoomAction({ name: String(fd.get("name")), notes: String(fd.get("notes") ?? ""), layoutId: String(fd.get("layoutId") || "") || null }, room?.id);
              if (!res.ok) return void toast.error(res.error);
              onClose();
            });
          }}
        >
          <Field label="Room name" htmlFor="room-name">
            <Input id="room-name" name="name" defaultValue={room?.name} required maxLength={80} autoFocus />
          </Field>
          <Field label="Stage plot" htmlFor="room-layout" hint="A room layout from any project, shown read-only. Gear links and cable IDs aren't shown.">
            <Select id="room-layout" name="layoutId" defaultValue={room?.layoutId ?? ""}>
              <option value="">None</option>
              {layouts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.project})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes for the tech packet" htmlFor="room-notes" hint="Power, load-in, stage size. Markdown.">
            <Textarea id="room-notes" name="notes" defaultValue={room?.notes} rows={6} placeholder={"- Stage: 32' × 16'\n- Power: two 20A circuits stage left\n- Load-in: east doors, no stairs"} />
          </Field>
          <div className="flex items-center gap-2">
            {room && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove ${room.name} from the public gear page? Its gear stays in the app.`)) return;
                  start(async () => {
                    const res = await deleteRoomAction(room.id);
                    if (res.ok) onClose();
                    else toast.error(res.error);
                  });
                }}
              >
                <Trash2 /> Remove
              </Button>
            )}
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Public gear ----------

/** One gear item's public fields. Used on the Public site page and on the gear item's own page. */
export function GearPublicForm({ item, rooms, compact }: { item: GearRow; rooms: Room[]; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [show, setShow] = useState(item.show);
  const [dirty, setDirty] = useState(false);
  const id = `gp-${item.id}`;
  return (
    <form
      aria-label={`Public page settings for ${item.name}`}
      onChange={() => setDirty(true)}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await setGearPublicAction(item.id, {
            show,
            name: String(fd.get("name") ?? ""),
            qty: Math.max(1, Math.round(Number(fd.get("qty") || 1))),
            note: String(fd.get("note") ?? ""),
            roomId: String(fd.get("roomId") || "") || null,
            group: (String(fd.get("group")) as GearGroup) || null,
          });
          if (!res.ok) return void toast.error(res.error);
          setDirty(false);
          toast(show ? "Shown on the public page" : "Saved");
        });
      }}
      className={cn("grid gap-3", !compact && "rounded-[8px] border border-line p-3", show ? "" : "opacity-90")}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-[13.5px] text-fg-hi">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-4 accent-[var(--cta)]" />
          Show on public page
        </label>
        {!compact && (
          <span className="text-[13px] text-muted">
            <Link href={`/gear/${item.id}`} className="hover:text-fg-hi">
              {item.name}
            </Link>
            {item.category && ` · ${item.category}`}
            {item.location && ` · ${item.location}`}
          </span>
        )}
      </div>
      {show && (
        <div className="grid gap-3 sm:grid-cols-[2fr_80px_1fr_1fr]">
          <Field label="Public name" htmlFor={`${id}-name`}>
            <Input id={`${id}-name`} name="name" defaultValue={item.publicName || item.name} required maxLength={120} />
          </Field>
          <Field label="Quantity" htmlFor={`${id}-qty`}>
            <Input id={`${id}-qty`} name="qty" type="number" min={1} max={9999} defaultValue={item.qty} />
          </Field>
          <Field label="Room" htmlFor={`${id}-room`}>
            <Select id={`${id}-room`} name="roomId" defaultValue={item.roomId ?? rooms[0]?.id ?? ""} required>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Group" htmlFor={`${id}-group`}>
            <Select id={`${id}-group`} name="group" defaultValue={item.group}>
              {GEAR_GROUPS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Public note" htmlFor={`${id}-note`} className="sm:col-span-4" hint="Only the public name, quantity and this note are shown. Never serials, IPs, MACs or backups.">
            <Input id={`${id}-note`} name="note" defaultValue={item.note} maxLength={300} placeholder="Wireless, with headset option" />
          </Field>
        </div>
      )}
      {(dirty || show !== item.show) && (
        <div>
          <Button type="submit" size="sm" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </form>
  );
}

export function PublicGearEditor({ gear, rooms }: { gear: GearRow[]; rooms: Room[] }) {
  const [q, setQ] = useState("");
  const [onlyPublic, setOnlyPublic] = useState(false);
  const query = q.trim().toLowerCase();
  const shown = gear.filter((g) => (!onlyPublic || g.show) && (!query || `${g.name} ${g.publicName} ${g.category} ${g.location}`.toLowerCase().includes(query)));
  return (
    <Section id="gear-h" title={`Gear on the public page · ${gear.filter((g) => g.show).length} of ${gear.length}`} view="/gear-at-hope">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find gear" aria-label="Find gear" className="h-8 w-56" />
        <label className="flex items-center gap-2 text-[13px] text-fg-2">
          <input type="checkbox" checked={onlyPublic} onChange={(e) => setOnlyPublic(e.target.checked)} className="size-3.5 accent-[var(--cta)]" />
          Only gear on the public page
        </label>
      </div>
      {!gear.length ? (
        <p className="text-[13px] text-muted">
          No gear yet. Add it in{" "}
          <Link href="/gear" className="underline underline-offset-2">
            Gear
          </Link>
          .
        </p>
      ) : (
        <div className="grid gap-2">
          {shown.map((g) => (
            <GearPublicForm key={g.id} item={g} rooms={rooms} />
          ))}
        </div>
      )}
    </Section>
  );
}
