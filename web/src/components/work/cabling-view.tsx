"use client";

import { ArrowDown, ArrowUp, Download, Plus, Printer, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCableAction, saveCableAction } from "@/app/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { CABLE_STATUSES, CABLE_STATUS_LABEL, CABLE_TYPES, type CableStatus } from "@/lib/cabling";
import { downloadCsv, slug } from "@/lib/csv";
import { labelHue } from "@/lib/work";
import { cn } from "@/lib/utils";
import type { Cable } from "@/server/services/cabling";

const TONE = { planned: "neutral", pulled: "strong", terminated: "info", tested: "warn", labeled: "warn", complete: "good" } as const;
export const CableStatusBadge = ({ status }: { status: CableStatus }) => <Badge tone={TONE[status]}>{CABLE_STATUS_LABEL[status]}</Badge>;

export function CableType({ type }: { type: string }) {
  const h = labelHue(type);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]">
      <span className="size-2 rounded-full" style={{ background: `hsl(${h} 55% 55%)` }} aria-hidden />
      {type}
    </span>
  );
}

type SortKey = "label" | "type" | "from" | "to" | "lengthFt" | "status" | "room";
const COLUMNS: [SortKey, string, string?][] = [
  ["label", "Cable ID"],
  ["type", "Type"],
  ["from", "From"],
  ["to", "To"],
  ["lengthFt", "Length", "text-right"],
  ["status", "Status"],
  ["room", "Room", "max-md:hidden"],
];

export function CablingView({ projectId, projectName, cables }: { projectId: string; projectName: string; cables: Cable[] }) {
  const [editing, setEditing] = useState<Cable | "new" | null>(null);
  const [status, setStatus] = useState<CableStatus | "">("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "label", dir: 1 });
  const query = q.trim().toLowerCase();
  const rows = cables
    .filter((c) => (!status || c.status === status) && (!query || `${c.label} ${c.type} ${c.from} ${c.to} ${c.room} ${c.notes}`.toLowerCase().includes(query)))
    .sort((a, b) => {
      const k = sort.key;
      const av = k === "status" ? CABLE_STATUSES.indexOf(a.status) : k === "lengthFt" ? (a.lengthFt ?? -1) : String(a[k]).toLowerCase();
      const bv = k === "status" ? CABLE_STATUSES.indexOf(b.status) : k === "lengthFt" ? (b.lengthFt ?? -1) : String(b[k]).toLowerCase();
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir || a.label.localeCompare(b.label, undefined, { numeric: true });
    });
  const feet = new Map<string, number>();
  for (const c of cables) feet.set(c.type, (feet.get(c.type) ?? 0) + (c.lengthFt ?? 0));
  const byType = [...feet].filter(([, ft]) => ft > 0).sort((a, b) => b[1] - a[1]);
  const maxFt = Math.max(1, ...byType.map(([, ft]) => ft));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
          <button type="button" aria-pressed={!status} onClick={() => setStatus("")} className={cn("rounded-full border px-2.5 py-0.5 text-xs", !status ? "border-fg-2 bg-wash text-fg-hi" : "border-line text-muted hover:text-fg-hi")}>
            All <span className="text-faint">{cables.length}</span>
          </button>
          {CABLE_STATUSES.map((s) => {
            const n = cables.filter((c) => c.status === s).length;
            if (!n) return null;
            return (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(status === s ? "" : s)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", status === s ? "border-fg-2 bg-wash text-fg-hi" : "border-line text-muted hover:text-fg-hi")}>
                {CABLE_STATUS_LABEL[s]} <span className="text-faint">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="relative min-w-40 flex-1 sm:max-w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter cables" aria-label="Filter cables" className="h-8 pl-8" />
        </label>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => downloadCsv(`cable-schedule-${slug(projectName)}`, [["Cable ID", "Type", "From", "To", "Length (ft)", "Status", "Room", "Notes"], ...rows.map((c) => [c.label, c.type, c.from, c.to, c.lengthFt ?? "", CABLE_STATUS_LABEL[c.status], c.room, c.notes])])}>
          <Download /> CSV
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={`/print/cables/${projectId}`} target="_blank">
            <Printer /> Cable labels
          </Link>
        </Button>
        <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
          <Plus /> Cable
        </Button>
      </div>

      {cables.length ? (
        <div className="overflow-x-auto rounded-[12px] border border-line bg-surface">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                {COLUMNS.map(([k, label, cls]) => (
                  <th key={k} className={cn("px-3 py-2 font-normal", cls)} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                    <button type="button" className="inline-flex items-center gap-1 hover:text-fg-hi" onClick={() => setSort({ key: k, dir: sort.key === k ? (-sort.dir as 1 | -1) : 1 })}>
                      {label}
                      {sort.key === k && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 font-normal max-lg:hidden">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-wash-2" onClick={() => setEditing(c)}>
                  <td className="px-3 py-2">
                    <button type="button" className="font-mono font-[510] text-fg-hi" onClick={() => setEditing(c)}>
                      {c.label}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <CableType type={c.type} />
                  </td>
                  <td className="px-3 py-2 text-fg-2">{c.from}</td>
                  <td className="px-3 py-2 text-fg-2">{c.to}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{c.lengthFt !== null ? `${c.lengthFt.toLocaleString()} ft` : ""}</td>
                  <td className="px-3 py-2">
                    <CableStatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-2 text-fg-2 max-md:hidden">{c.room}</td>
                  <td className="max-w-56 truncate px-3 py-2 text-muted max-lg:hidden">{c.notes}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted">
                    No cables match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-[12px] border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted">No cables in the schedule yet. Add each run with an ID like NET-014 so both ends can be labelled.</p>
      )}

      {byType.length > 0 && (
        <section className="mt-6 max-w-2xl rounded-[12px] border border-line bg-surface p-4">
          <h2 className="mb-3 text-[14px] font-[510]">
            Footage by type <span className="font-normal text-muted">· {byType.reduce((s, [, ft]) => s + ft, 0).toLocaleString()} ft in total</span>
          </h2>
          <ul className="grid gap-2" role="list">
            {byType.map(([type, ft]) => (
              <li key={type} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[13px]">
                <CableType type={type} />
                <span className="h-2 overflow-hidden rounded-full bg-wash">
                  <span className="block h-full rounded-full" style={{ width: `${(ft / maxFt) * 100}%`, background: `hsl(${labelHue(type)} 55% 55%)` }} />
                </span>
                <span className="font-mono text-xs text-fg-2">{ft.toLocaleString()} ft</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CableDialog key={editing === "new" ? "new" : editing?.id} projectId={projectId} cable={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function CableDialog({ projectId, cable, onClose }: { projectId: string; cable: Cable | "new" | null; onClose: () => void }) {
  const [pending, start] = useTransition();
  const current = cable === "new" ? null : cable;
  return (
    <Dialog open={cable !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={current ? `Cable ${current.label}` : "Add cable"}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const s = (k: string) => String(fd.get(k) ?? "");
            start(async () => {
              const res = await saveCableAction(
                projectId,
                { label: s("label"), type: s("type") || "Other", from: s("from"), to: s("to"), lengthFt: s("lengthFt") ? Number(s("lengthFt")) : null, status: s("status") as CableStatus, room: s("room"), notes: s("notes") },
                current?.id,
              );
              if (!res.ok) return void toast.error(res.error);
              toast(current ? "Saved" : "Cable added");
              onClose();
            });
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Cable ID" htmlFor="cb-label">
              <Input id="cb-label" name="label" defaultValue={current?.label} required autoFocus className="font-mono" placeholder="NET-014" />
            </Field>
            <Field label="Type" htmlFor="cb-type">
              <Input id="cb-type" name="type" list="cable-types" defaultValue={current?.type ?? "Cat6A"} />
              <datalist id="cable-types">
                {CABLE_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="From" htmlFor="cb-from">
              <Input id="cb-from" name="from" defaultValue={current?.from} placeholder="Booth Rack B" />
            </Field>
            <Field label="To" htmlFor="cb-to">
              <Input id="cb-to" name="to" defaultValue={current?.to} placeholder="PTZ-2 (Balcony)" />
            </Field>
            <Field label="Length (ft)" htmlFor="cb-len">
              <Input id="cb-len" name="lengthFt" type="number" min={0} step="any" inputMode="decimal" defaultValue={current?.lengthFt ?? ""} />
            </Field>
            <Field label="Status" htmlFor="cb-status">
              <Select id="cb-status" name="status" defaultValue={current?.status ?? "planned"}>
                {CABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CABLE_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Room" htmlFor="cb-room">
            <Input id="cb-room" name="room" defaultValue={current?.room} placeholder="Sanctuary" />
          </Field>
          <Field label="Notes" htmlFor="cb-notes">
            <Textarea id="cb-notes" name="notes" defaultValue={current?.notes} rows={2} />
          </Field>
          <div className="flex items-center gap-2">
            {current && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove ${current.label} from the schedule?`)) return;
                  start(async () => {
                    const res = await deleteCableAction(current.id);
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
              {current ? "Save" : "Add cable"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
