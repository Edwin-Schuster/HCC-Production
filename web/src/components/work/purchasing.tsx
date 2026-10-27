"use client";

import { PackageCheck, Paperclip, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteBomAction, deletePoAction, receivePoAction, saveBomAction, savePoAction } from "@/app/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { Attachment } from "@/db/schema";
import { formatDay, formatMoney } from "@/lib/format";
import { BOM_STATUSES, BOM_STATUS_LABEL, BUDGET_CATEGORIES, PO_STATUSES, PO_STATUS_LABEL, type BomStatus, type PoStatus } from "@/lib/purchasing";
import { slug } from "@/lib/csv";
import type { BomItem, PurchaseOrder } from "@/server/services/purchasing";
import { DataTable } from "./data-table";
import { AttachmentList, uploadAttachment } from "./task-drawer";

const money = (c: number) => formatMoney(c, { cents: c % 100 !== 0 });
const BOM_TONE = { needed: "neutral", quoted: "strong", ordered: "info", received: "good", installed: "good" } as const;
const PO_TONE = { draft: "neutral", submitted: "strong", approved: "info", ordered: "info", partially_received: "warn", received: "good", cancelled: "neutral" } as const;
export const BomStatusBadge = ({ status }: { status: BomStatus }) => <Badge tone={BOM_TONE[status]}>{BOM_STATUS_LABEL[status]}</Badge>;
export const PoStatusBadge = ({ status }: { status: PoStatus }) => <Badge tone={PO_TONE[status]}>{PO_STATUS_LABEL[status]}</Badge>;
const canReceive = (p: PurchaseOrder) => !["draft", "received", "cancelled"].includes(p.status);

function Categories() {
  return (
    <datalist id="budget-categories">
      {BUDGET_CATEGORIES.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  );
}

export function BomSection({ projectId, projectName, items }: { projectId: string; projectName: string; items: BomItem[] }) {
  const [editing, setEditing] = useState<BomItem | "new" | null>(null);
  return (
    <section aria-labelledby="bom-h">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="bom-h" className="text-[15px] font-[510]">
          Bill of materials
        </h2>
        <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
          <Plus /> Item
        </Button>
      </div>
      <DataTable
        label="Bill of materials"
        rows={items}
        onRow={setEditing}
        csv={`bom-${slug(projectName)}`}
        empty="Add the parts this project needs to see what it will cost."
        columns={[
          { key: "item", label: "Item" },
          { key: "partNumber", label: "Part #", render: (x) => <span className="font-mono text-xs">{x.partNumber}</span> },
          { key: "vendor", label: "Vendor", className: "max-md:hidden" },
          { key: "category", label: "Category" },
          { key: "qty", label: "Qty", align: "right", render: (x) => x.qty.toLocaleString("en-US") },
          { key: "unit", label: "Unit", align: "right", value: (x) => x.unitCostCents / 100, render: (x) => <span className="font-mono text-xs">{money(x.unitCostCents)}</span> },
          { key: "total", label: "Total", align: "right", value: (x) => Math.round(x.qty * x.unitCostCents) / 100, render: (x) => <b className="font-mono text-xs font-[510] text-fg-hi">{money(Math.round(x.qty * x.unitCostCents))}</b> },
          { key: "status", label: "Status", value: (x) => BOM_STATUS_LABEL[x.status], render: (x) => <BomStatusBadge status={x.status} /> },
        ]}
      />
      <BomDialog key={editing === "new" ? "new" : editing?.id} projectId={projectId} item={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function BomDialog({ projectId, item, onClose }: { projectId: string; item: BomItem | "new" | null; onClose: () => void }) {
  const [pending, start] = useTransition();
  const current = item === "new" ? null : item;
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={current ? current.item : "Add to the bill of materials"}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const s = (k: string) => String(fd.get(k) ?? "");
            start(async () => {
              const res = await saveBomAction(projectId, { item: s("item"), partNumber: s("partNumber"), vendor: s("vendor"), category: s("category") || "Other", qty: Number(s("qty") || 0), unitCost: Number(s("unitCost") || 0), status: s("status") as BomStatus }, current?.id);
              if (!res.ok) return void toast.error(res.error);
              onClose();
            });
          }}
        >
          <Field label="Item" htmlFor="bom-item">
            <Input id="bom-item" name="item" defaultValue={current?.item} required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Part number" htmlFor="bom-part">
              <Input id="bom-part" name="partNumber" defaultValue={current?.partNumber} className="font-mono" />
            </Field>
            <Field label="Vendor" htmlFor="bom-vendor">
              <Input id="bom-vendor" name="vendor" defaultValue={current?.vendor} />
            </Field>
            <Field label="Category" htmlFor="bom-cat">
              <Input id="bom-cat" name="category" list="budget-categories" defaultValue={current?.category ?? "Audio"} />
              <Categories />
            </Field>
            <Field label="Status" htmlFor="bom-status">
              <Select id="bom-status" name="status" defaultValue={current?.status ?? "needed"}>
                {BOM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {BOM_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity" htmlFor="bom-qty">
              <Input id="bom-qty" name="qty" type="number" min={0} step="any" inputMode="decimal" defaultValue={current?.qty ?? 1} />
            </Field>
            <Field label="Unit cost ($)" htmlFor="bom-cost">
              <Input id="bom-cost" name="unitCost" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={current ? current.unitCostCents / 100 : ""} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            {current && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove “${current.item}”?`)) return;
                  start(async () => {
                    const res = await deleteBomAction(current.id);
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
              {current ? "Save" : "Add item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Project = { id: string; name: string };

/** Purchase orders for one project, or (with projects) across all of them. */
export function PurchaseOrders({ orders, projectId, projects, bom = [], nextNumber, csvName }: { orders: PurchaseOrder[]; projectId?: string; projects?: Project[]; bom?: BomItem[]; nextNumber: string; csvName: string }) {
  const [editing, setEditing] = useState<PurchaseOrder | "new" | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [status, setStatus] = useState("");
  const shown = status === "open" ? orders.filter((o) => !["received", "cancelled"].includes(o.status)) : status ? orders.filter((o) => o.status === status) : orders;
  return (
    <section aria-labelledby="po-h">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="po-h" className="text-[15px] font-[510]">
          Purchase orders
        </h2>
        <Button size="sm" variant="primary" onClick={() => setEditing("new")} disabled={!projectId && !projects?.length}>
          <Plus /> Purchase order
        </Button>
      </div>
      <DataTable
        label="Purchase orders"
        rows={shown}
        onRow={setEditing}
        csv={csvName}
        empty="No purchase orders yet."
        toolbar={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="h-8 w-auto md:text-[13px]">
            <option value="">Any status</option>
            <option value="open">Open (not received)</option>
            {PO_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PO_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        }
        columns={[
          { key: "poNumber", label: "PO #", render: (x) => <span className="font-mono">{x.poNumber}</span> },
          { key: "vendor", label: "Vendor" },
          { key: "date", label: "Date", render: (x) => formatDay(x.date) },
          ...(projects ? [{ key: "projectName", label: "Project" }] : []),
          { key: "total", label: "Total", align: "right" as const, value: (x: PurchaseOrder) => x.totalCents / 100, render: (x: PurchaseOrder) => <b className="font-mono text-xs font-[510] text-fg-hi">{money(x.totalCents)}</b> },
          { key: "received", label: "Received", align: "right" as const, value: (x: PurchaseOrder) => (x.totalCents ? Math.round((x.receivedCents / x.totalCents) * 100) : 0), render: (x: PurchaseOrder) => <span className="font-mono text-xs">{x.totalCents ? Math.round((x.receivedCents / x.totalCents) * 100) : 0}%</span> },
          { key: "status", label: "Status", value: (x) => PO_STATUS_LABEL[x.status], render: (x) => <PoStatusBadge status={x.status} /> },
          {
            key: "act",
            label: "",
            noCsv: true,
            value: () => "",
            render: (x) =>
              canReceive(x) && (
                <Button size="xs" onClick={(e) => (e.stopPropagation(), setReceiving(x))}>
                  <PackageCheck /> Receive
                </Button>
              ),
          },
        ]}
      />
      <PoDialog key={editing === "new" ? "new" : editing?.id} order={editing} projectId={projectId} projects={projects} bom={bom} nextNumber={nextNumber} onClose={() => setEditing(null)} />
      <ReceiveDialog key={receiving?.id} order={receiving} onClose={() => setReceiving(null)} />
    </section>
  );
}

type LineDraft = { id?: string; desc: string; qty: string; unitCost: string; receivedQty: number; bomItemId: string };

function PoDialog({ order, projectId, projects, bom, nextNumber, onClose }: { order: PurchaseOrder | "new" | null; projectId?: string; projects?: Project[]; bom: BomItem[]; nextNumber: string; onClose: () => void }) {
  const current = order === "new" ? null : order;
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<LineDraft[]>(
    current?.lines.map((l) => ({ id: l.id, desc: l.desc, qty: String(l.qty), unitCost: String(l.unitCostCents / 100), receivedQty: l.receivedQty, bomItemId: l.bomItemId ?? "" })) ?? [{ desc: "", qty: "1", unitCost: "", receivedQty: 0, bomItemId: "" }],
  );
  const [files, setFiles] = useState<Attachment[]>(current?.attachments ?? []);
  const [uploading, setUploading] = useState(false);
  const total = lines.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.unitCost) || 0) * 100), 0);
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const projectBom = current ? bom.filter((b) => b.projectId === current.projectId) : bom;

  return (
    <Dialog open={order !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={current ? `Purchase order ${current.poNumber}` : "New purchase order"} wide>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const s = (k: string) => String(fd.get(k) ?? "");
            const pid = current?.projectId ?? projectId ?? s("projectId");
            start(async () => {
              const res = await savePoAction(
                pid,
                {
                  poNumber: s("poNumber"),
                  vendor: s("vendor"),
                  date: s("date") || null,
                  status: s("status") as PoStatus,
                  category: s("category") || "Other",
                  notes: s("notes"),
                  attachments: files,
                  lines: lines.filter((l) => l.desc.trim()).map((l) => ({ id: l.id, desc: l.desc, qty: Number(l.qty) || 0, unitCost: Number(l.unitCost) || 0, receivedQty: l.receivedQty, bomItemId: l.bomItemId || null })),
                },
                current?.id,
              );
              if (!res.ok) return void toast.error(res.error);
              onClose();
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="PO number" htmlFor="po-num">
              <Input id="po-num" name="poNumber" defaultValue={current?.poNumber ?? nextNumber} required className="font-mono" />
            </Field>
            <Field label="Vendor" htmlFor="po-vendor">
              <Input id="po-vendor" name="vendor" defaultValue={current?.vendor} autoFocus={!current} />
            </Field>
            <Field label="Date" htmlFor="po-date">
              <Input id="po-date" name="date" type="date" defaultValue={current?.date ?? ""} />
            </Field>
            {!current && !projectId && projects && (
              <Field label="Project" htmlFor="po-project">
                <Select id="po-project" name="projectId" required>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Category" htmlFor="po-cat">
              <Input id="po-cat" name="category" list="budget-categories" defaultValue={current?.category ?? "Audio"} />
              <Categories />
            </Field>
            <Field label="Status" htmlFor="po-status" hint="Receiving moves an ordered PO along by itself.">
              <Select id="po-status" name="status" defaultValue={current?.status ?? "draft"}>
                {PO_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PO_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-xs font-[510] text-muted">Lines</legend>
            {lines.map((l, i) => (
              <div key={l.id ?? `new-${i}`} className="grid grid-cols-[1fr_70px_100px_auto] items-start gap-2 rounded-[8px] border border-line p-2 sm:grid-cols-[1fr_150px_70px_100px_auto]">
                <Input value={l.desc} onChange={(e) => setLine(i, { desc: e.target.value })} placeholder="Description" aria-label={`Line ${i + 1} description`} className="h-8" />
                <Select
                  value={l.bomItemId}
                  onChange={(e) => {
                    const b = projectBom.find((x) => x.id === e.target.value);
                    setLine(i, { bomItemId: e.target.value, ...(b && !l.desc ? { desc: b.item, qty: String(b.qty), unitCost: String(b.unitCostCents / 100) } : {}) });
                  }}
                  aria-label={`Line ${i + 1} BOM item`}
                  className="h-8 max-sm:col-span-4 max-sm:row-start-2 md:text-[13px]"
                >
                  <option value="">No BOM link</option>
                  {projectBom.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.item}
                    </option>
                  ))}
                </Select>
                <Input value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} type="number" min={0} step="any" inputMode="decimal" aria-label={`Line ${i + 1} quantity`} className="h-8" />
                <Input value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} type="number" min={0} step="0.01" inputMode="decimal" placeholder="Unit $" aria-label={`Line ${i + 1} unit cost`} className="h-8" />
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove line ${i + 1}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  <X />
                </Button>
                {l.receivedQty > 0 && <span className="col-span-full text-xs text-muted">Received {l.receivedQty} so far</span>}
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" size="sm" variant="ghost" onClick={() => setLines([...lines, { desc: "", qty: "1", unitCost: "", receivedQty: 0, bomItemId: "" }])}>
                <Plus /> Line
              </Button>
              <span className="text-[13px] text-muted">
                Total <b className="font-mono font-[510] text-fg-hi">{money(total)}</b>
              </span>
            </div>
          </fieldset>

          <Field label="Notes" htmlFor="po-notes">
            <Textarea id="po-notes" name="notes" defaultValue={current?.notes} rows={2} />
          </Field>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-[510] text-muted">Quotes and receipts</span>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-fg-2 hover:text-fg-hi">
                <Paperclip className="size-3.5" /> {uploading ? "Uploading…" : "Attach"}
                <input
                  type="file"
                  multiple
                  hidden
                  onChange={async (e) => {
                    const list = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (!list.length) return;
                    setUploading(true);
                    try {
                      const added: Attachment[] = [];
                      for (const f of list) added.push(await uploadAttachment(f));
                      setFiles((fs) => [...fs, ...added]);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Upload failed");
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
            </div>
            <AttachmentList items={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
          </div>
          <div className="flex items-center gap-2">
            {current && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Delete ${current.poNumber}?`)) return;
                  start(async () => {
                    const res = await deletePoAction(current.id);
                    if (res.ok) onClose();
                    else toast.error(res.error);
                  });
                }}
              >
                <Trash2 /> Delete
              </Button>
            )}
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending || uploading}>
              {current ? "Save" : "Create purchase order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ order, onClose }: { order: PurchaseOrder | null; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [got, setGot] = useState<Record<string, string>>(Object.fromEntries(order?.lines.map((l) => [l.id, String(l.receivedQty)]) ?? []));
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  return (
    <Dialog open={order !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Receive ${order?.poNumber ?? ""}`} description={`${order?.vendor ?? ""}: enter how many of each line have arrived in total.`}>
        {order && (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await receivePoAction(order.id, { received: Object.fromEntries(Object.entries(got).map(([k, v]) => [k, Number(v) || 0])), date });
                if (!res.ok) return void toast.error(res.error);
                toast("Receipt saved");
                onClose();
              });
            }}
          >
            {order.lines.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-fg-2">
                  {l.desc} <span className="text-muted">× {l.qty}</span>
                </span>
                <Input value={got[l.id] ?? "0"} onChange={(e) => setGot({ ...got, [l.id]: e.target.value })} type="number" min={0} max={l.qty} step="any" inputMode="decimal" aria-label={`Received: ${l.desc}`} className="h-8 w-24" />
                <Button type="button" size="xs" onClick={() => setGot({ ...got, [l.id]: String(l.qty) })}>
                  All
                </Button>
              </div>
            ))}
            <Field label="Received on" htmlFor="rv-date">
              <Input id="rv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                Save receipt
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
