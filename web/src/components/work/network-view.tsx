"use client";

import { Download, FileSpreadsheet, Pencil, Plus, Search, Trash2, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { copyProjectNetworkAction, deletePortAction, importPortsAction, renameSwitchAction, savePortAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { downloadCsv, slug } from "@/lib/csv";
import { duplicateIps, isIpv4 } from "@/lib/network";
import { labelHue } from "@/lib/work";
import { readWorkbook, type PortRow } from "@/lib/project-workbook";
import { readCsv, readXlsx } from "@/lib/xlsx";
import { cn } from "@/lib/utils";
import type { NetworkPort } from "@/server/services/network";

function Vlan({ name }: { name: string }) {
  if (!name) return null;
  const h = labelHue(name);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]">
      <span className="size-2 rounded-full" style={{ background: `hsl(${h} 55% 55%)` }} aria-hidden />
      {name}
    </span>
  );
}

/** A port is in use when something is plugged in, including an uplink to another switch. */
const inUse = (p: NetworkPort) => Boolean(p.device) || /uplink|trunk/i.test(`${p.vlan} ${p.notes}`);

/** The project's network plan: each switch (and Wi-Fi) as a table of ports, with VLAN filters and IP checks. */
export function NetworkView({ projectId, projectName, ports, sources = [] }: { projectId: string | null; projectName: string; ports: NetworkPort[]; sources?: { id: string; name: string; ports: number }[] }) {
  const [editing, setEditing] = useState<NetworkPort | { switchName: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [vlan, setVlan] = useState("");
  const [q, setQ] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const query = q.trim().toLowerCase();
  const dupes = duplicateIps(ports);
  const vlans = [...new Set(ports.map((p) => p.vlan).filter(Boolean))].sort();
  const shown = ports.filter((p) => (!vlan || p.vlan === vlan) && (!freeOnly || (p.port && !inUse(p))) && (!query || `${p.switchName} ${p.port} ${p.vlan} ${p.ip} ${p.device} ${p.mac} ${p.notes}`.toLowerCase().includes(query)));
  const switches = [...new Set(ports.map((p) => p.switchName))];
  const free = ports.filter((p) => p.port && !inUse(p)).length;

  return (
    <>
      {dupes.size > 0 && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-[8px] border border-bad/40 bg-bad-soft px-3 py-2 text-[13px] text-fg-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" />
          <span>
            {dupes.size === 1 ? "One IP address is" : `${dupes.size} IP addresses are`} used by more than one device:{" "}
            {[...dupes].map(([ip, rows], i) => (
              <span key={ip}>
                {i > 0 && "; "}
                <b className="font-mono font-[510] text-fg-hi">{ip}</b> ({rows.length}×, {[...new Set(rows.map((r) => r.device || r.port))].join(", ")})
              </span>
            ))}
            . Give each its own address.
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by VLAN">
          <button type="button" aria-pressed={!vlan} onClick={() => setVlan("")} className={cn("rounded-full border px-2.5 py-0.5 text-xs", !vlan ? "border-fg-2 bg-wash text-fg-hi" : "border-line text-muted hover:text-fg-hi")}>
            All <span className="text-faint">{ports.length}</span>
          </button>
          {vlans.map((v) => (
            <button key={v} type="button" aria-pressed={vlan === v} onClick={() => setVlan(vlan === v ? "" : v)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", vlan === v ? "border-fg-2 bg-wash text-fg-hi" : "border-line text-muted hover:text-fg-hi")}>
              {v} <span className="text-faint">{ports.filter((p) => p.vlan === v).length}</span>
            </button>
          ))}
          {free > 0 && (
            <button type="button" aria-pressed={freeOnly} onClick={() => setFreeOnly(!freeOnly)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", freeOnly ? "border-fg-2 bg-wash text-fg-hi" : "border-line text-muted hover:text-fg-hi")}>
              Free ports <span className="text-faint">{free}</span>
            </button>
          )}
        </div>
        <label className="relative min-w-40 flex-1 sm:max-w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a device or IP" aria-label="Find a device or IP" className="h-8 pl-8" />
        </label>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => downloadCsv(`network-${slug(projectName)}`, [["Switch", "Port", "VLAN", "Reserved IP", "Device", "MAC", "Length", "Notes"], ...shown.map((p) => [p.switchName, p.port, p.vlan, p.ip, p.device, p.mac, p.length, p.notes])])}
        >
          <Download /> CSV
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setImporting(true)}>
          <FileSpreadsheet /> Import
        </Button>
        <Button size="sm" variant="primary" onClick={() => setEditing({ switchName: switches[0] ?? "Switch 1" })}>
          <Plus /> Port
        </Button>
      </div>

      {!ports.length ? (
        <p className="rounded-[12px] border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted">{projectId ? "No network plan yet. Add each switch port with its VLAN, reserved IP and device, or import a spreadsheet." : "Nothing here yet. Add each switch and its ports, Wi-Fi devices and their reserved IPs, or import a spreadsheet or a project's network plan."}</p>
      ) : (
        <div className="grid gap-4">
          {switches.map((sw) => {
            const rows = shown.filter((p) => p.switchName === sw);
            const all = ports.filter((p) => p.switchName === sw);
            if (!rows.length) return null;
            const used = all.filter(inUse).length;
            return (
              <section key={sw} aria-label={sw} className="overflow-x-auto rounded-[12px] border border-line bg-surface">
                <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <h2 className="text-[14px] font-[510] text-fg-hi">{sw}</h2>
                  <span className="text-xs text-muted">
                    {all.some((p) => p.port) ? `${used} of ${all.length} ports in use` : `${all.length} device${all.length === 1 ? "" : "s"}`}
                  </span>
                  <span className="flex-1" />
                  <RenameSwitch projectId={projectId} name={sw} />
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ switchName: sw })}>
                    <Plus /> Add
                  </Button>
                </div>
                <table className="w-full min-w-[720px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="w-24 px-3 py-1.5 font-normal">Port</th>
                      <th className="px-3 py-1.5 font-normal">VLAN</th>
                      <th className="px-3 py-1.5 font-normal">Device</th>
                      <th className="px-3 py-1.5 font-normal">Reserved IP</th>
                      <th className="px-3 py-1.5 font-normal max-lg:hidden">MAC</th>
                      <th className="px-3 py-1.5 font-normal max-md:hidden">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const dup = dupes.has(p.ip.trim());
                      const badIp = p.ip && !isIpv4(p.ip);
                      return (
                        <tr key={p.id} className={cn("cursor-pointer border-b border-line last:border-0 hover:bg-wash-2", !inUse(p) && "text-muted")} onClick={() => setEditing(p)}>
                          <td className="px-3 py-1.5 font-mono text-xs text-fg-2">
                            <button type="button" onClick={() => setEditing(p)}>
                              {p.port || "—"}
                            </button>
                          </td>
                          <td className="px-3 py-1.5">
                            <Vlan name={p.vlan} />
                          </td>
                          <td className={cn("px-3 py-1.5", p.device ? "text-fg-hi" : "text-faint")}>{p.device || (inUse(p) ? "Uplink" : "Free")}</td>
                          <td className={cn("px-3 py-1.5 font-mono text-xs", dup || badIp ? "text-bad" : "text-fg-2")} title={dup ? "Another device uses this IP" : badIp ? "Not an IPv4 address" : undefined}>
                            {p.ip}
                            {(dup || badIp) && <TriangleAlert className="ml-1 inline size-3" aria-label={dup ? "Duplicate IP" : "Invalid IP"} />}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs text-fg-2 max-lg:hidden">{p.mac}</td>
                          <td className="max-w-64 truncate px-3 py-1.5 text-muted max-md:hidden">{p.notes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}
          {!shown.length && <p className="rounded-[12px] border border-line bg-surface px-6 py-8 text-center text-[13px] text-muted">No ports match.</p>}
        </div>
      )}

      {editing && <PortDialog projectId={projectId} port={editing} switches={switches} vlans={vlans} onClose={() => setEditing(null)} />}
      {importing && <ImportDialog projectId={projectId} sources={sources} onClose={() => setImporting(false)} />}
    </>
  );
}

function RenameSwitch({ projectId, name }: { projectId: string | null; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Rename ${name}`}
      disabled={pending}
      onClick={() => {
        const to = prompt("Name this switch", name)?.trim();
        if (!to || to === name) return;
        start(async () => {
          const res = await renameSwitchAction(projectId, name, to);
          if (!res.ok) toast.error(res.error);
        });
      }}
    >
      <Pencil />
    </Button>
  );
}

function PortDialog({ projectId, port, switches, vlans, onClose }: { projectId: string | null; port: NetworkPort | { switchName: string }; switches: string[]; vlans: string[]; onClose: () => void }) {
  const [pending, start] = useTransition();
  const current = "id" in port ? port : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={current ? `${current.switchName} · ${current.port || current.device}` : "Add a port or device"}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const s = (k: string) => String(fd.get(k) ?? "");
            start(async () => {
              const res = await savePortAction(projectId, { switchName: s("switchName"), port: s("port"), vlan: s("vlan"), ip: s("ip"), device: s("device"), mac: s("mac"), length: s("length"), notes: s("notes") }, current?.id);
              if (!res.ok) return void toast.error(res.error);
              onClose();
            });
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Switch" htmlFor="np-switch" hint="Or Wi-Fi">
              <Input id="np-switch" name="switchName" list="np-switches" defaultValue={port.switchName} required />
              <datalist id="np-switches">
                {[...switches, "Wi-Fi"].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Port" htmlFor="np-port">
              <Input id="np-port" name="port" defaultValue={current?.port} placeholder="Port 12" />
            </Field>
            <Field label="Device" htmlFor="np-device">
              <Input id="np-device" name="device" defaultValue={current?.device} autoFocus placeholder="GFX 1" />
            </Field>
            <Field label="VLAN" htmlFor="np-vlan">
              <Input id="np-vlan" name="vlan" list="np-vlans" defaultValue={current?.vlan} placeholder="Production Network" />
              <datalist id="np-vlans">
                {vlans.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </Field>
            <Field label="Reserved IP" htmlFor="np-ip">
              <Input id="np-ip" name="ip" defaultValue={current?.ip} className="font-mono" placeholder="10.0.19.15" />
            </Field>
            <Field label="MAC address" htmlFor="np-mac">
              <Input id="np-mac" name="mac" defaultValue={current?.mac} className="font-mono" />
            </Field>
          </div>
          <Field label="Notes" htmlFor="np-notes">
            <Textarea id="np-notes" name="notes" defaultValue={current?.notes} rows={2} placeholder="Static, PoE" />
          </Field>
          <input type="hidden" name="length" value={current?.length ?? ""} />
          <div className="flex items-center gap-2">
            {current && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove ${current.port || current.device} from ${current.switchName}?`)) return;
                  start(async () => {
                    const res = await deletePortAction(current.id);
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
              {current ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Bring in a network tab from a spreadsheet, or (for the church's network) a project's plan. */
function ImportDialog({ projectId, sources, onClose }: { projectId: string | null; sources: { id: string; name: string; ports: number }[]; onClose: () => void }) {
  const [rows, setRows] = useState<PortRow[] | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = async (file: File) => {
    setError(null);
    setSource("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sheets = /\.csv$/i.test(file.name) ? [{ name: file.name, rows: readCsv(new TextDecoder().decode(bytes)) }] : readXlsx(bytes);
      const ports = readWorkbook(sheets).ports;
      if (!ports.length) throw new Error("No tab in that file looks like a network plan: it needs columns like Connection (or Port), VLAN, Reserved IP and Device Name.");
      setRows(ports);
    } catch (e) {
      setRows(null);
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };

  const ready = Boolean(rows?.length || source);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Import a network plan" description="Rows already here are matched by switch and port (Wi-Fi by device), so importing again updates them instead of adding copies.">
        <div className="grid gap-4">
          <Field label="Spreadsheet" htmlFor="net-file" hint="Excel (.xlsx) or CSV with Connection, VLAN, Reserved IP, Device Name, MAC Address and Notes. A switch ends where the port numbers start again at 1.">
            <Input id="net-file" type="file" accept=".xlsx,.csv" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
          </Field>
          {!projectId && sources.length > 0 && (
            <Field label="Or copy a project's network plan" htmlFor="net-source">
              <Select
                id="net-source"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  if (e.target.value) setRows(null);
                }}
              >
                <option value="">Choose a project</option>
                {sources.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.ports} ports and devices)
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {error && (
            <p role="alert" className="text-[13px] text-bad">
              {error}
            </p>
          )}
          {rows && (
            <p className="text-[13px] text-fg-2" data-testid="network-import-summary">
              {rows.length} ports and devices on {[...new Set(rows.map((r) => r.switchName))].join(", ")}.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!ready || pending}
              onClick={() =>
                start(async () => {
                  const res = source ? await copyProjectNetworkAction(source) : await importPortsAction(projectId, rows!);
                  if (!res.ok) return void toast.error(res.error);
                  toast(`Imported: ${res.data.created} added, ${res.data.updated} updated`);
                  onClose();
                })
              }
            >
              {pending ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
