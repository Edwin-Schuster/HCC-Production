"use client";

import { Camera, Paperclip, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { deleteAccessAction, deleteContractorAction, deleteInvoiceAction, deletePunchAction, deleteScopeAction, saveAccessAction, saveContractorAction, saveInvoiceAction, savePunchAction, saveScopeAction } from "@/app/actions/contractors";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PUNCH_STATUSES, PUNCH_STATUS_LABEL, type PunchStatus } from "@/lib/contractors";
import { formatDay, formatMoney } from "@/lib/format";
import { INVOICE_STATUSES, INVOICE_STATUS_LABEL, SOW_STATUSES, SOW_STATUS_LABEL, type InvoiceStatus, type SowStatus } from "@/lib/purchasing";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/work";
import type { Access, Contractor, Invoice, Punch, Scope } from "@/server/services/contractors";
import { DataTable } from "./data-table";
import { AttachmentList } from "./task-drawer";
import { RecordDialog, num, orNull, type ActionResult, type FieldSpec } from "./record-dialog";

type Opt = { id: string; name: string };
const money = (c: number) => formatMoney(c, { cents: c % 100 !== 0 });
const asResult = (r: { ok: boolean; error?: string } | undefined): ActionResult => (!r || r.ok ? { ok: true } : { ok: false, error: r.error ?? "Couldn't save" });

const PUNCH_TONE = { open: "warn", in_progress: "info", ready_for_review: "strong", closed: "good" } as const;
const INVOICE_TONE = { received: "strong", approved: "info", paid: "good", disputed: "bad" } as const;
const SOW_TONE = { draft: "neutral", sent: "strong", signed: "info", in_progress: "info", complete: "good" } as const;
export const PunchBadge = ({ status }: { status: PunchStatus }) => <Badge tone={PUNCH_TONE[status]}>{PUNCH_STATUS_LABEL[status]}</Badge>;
export const InvoiceBadge = ({ status }: { status: InvoiceStatus }) => <Badge tone={INVOICE_TONE[status]}>{INVOICE_STATUS_LABEL[status]}</Badge>;
export const ScopeBadge = ({ status }: { status: SowStatus }) => <Badge tone={SOW_TONE[status]}>{SOW_STATUS_LABEL[status]}</Badge>;

function Header({ title, onAdd, addLabel }: { title: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-[15px] font-[510]">{title}</h2>
      <Button size="sm" onClick={onAdd}>
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}

// ---------- Contractor ----------

const CONTRACTOR_FIELDS: FieldSpec[] = [
  { name: "company", label: "Company", type: "text", required: true },
  { name: "trade", label: "Trade", type: "text", list: ["Electrical", "Rigging / Install", "Low voltage", "HVAC", "Carpentry", "Drywall / Paint", "AV integration"] },
  { name: "contact", label: "Contact", type: "text" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "email", label: "Email", type: "email" },
  { name: "rate", label: "Rate", type: "text", placeholder: "$95/hr or Fixed bid" },
  { name: "insuranceExpires", label: "Insurance expires", type: "date", hint: "You'll be warned 30 days before." },
  { name: "notes", label: "Notes", type: "textarea" },
];

export function ContractorButton({ contractor }: { contractor?: Contractor }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {contractor ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Pencil /> Edit
        </Button>
      ) : (
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus /> Contractor
        </Button>
      )}
      {open && (
        <RecordDialog
          open
          title={contractor ? `Edit ${contractor.company}` : "Add contractor"}
          fields={CONTRACTOR_FIELDS}
          initial={contractor ? { ...contractor, insuranceExpires: contractor.insuranceExpires ?? "" } : {}}
          files={{ label: "Documents (insurance certificate, W-9, contract)", items: contractor?.attachments ?? [] }}
          saveLabel={contractor ? "Save" : "Add contractor"}
          onSave={async (v, attachments) => asResult(await saveContractorAction({ company: v.company, trade: v.trade, contact: v.contact, phone: v.phone, email: v.email, rate: v.rate, notes: v.notes, insuranceExpires: orNull(v.insuranceExpires), attachments }, contractor?.id))}
          onDelete={contractor && (async () => asResult(await deleteContractorAction(contractor.id)))}
          confirmDelete={contractor && `Delete ${contractor.company}? Their scopes of work, site access and invoices are deleted too; punch items stay, unassigned.`}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function InsuranceNote({ c }: { c: Pick<Contractor, "insurance" | "insuranceExpires"> }) {
  if (c.insurance === "none") return <span className="text-muted">No insurance on file</span>;
  return (
    <span className={cn(c.insurance === "expired" ? "text-bad" : c.insurance === "expiring" ? "text-warn" : "text-muted")}>
      Insurance {c.insurance === "expired" ? "expired" : "to"} {formatDay(c.insuranceExpires)}
    </span>
  );
}

// ---------- Scopes of work ----------

export function ScopesSection({ scopes, contractors, projects, fixed }: { scopes: Scope[]; contractors: Opt[]; projects: Opt[]; fixed: { contractorId?: string; projectId?: string } }) {
  const [editing, setEditing] = useState<Scope | "new" | null>(null);
  const current = editing === "new" ? null : editing;
  const fields: FieldSpec[] = [
    { name: "title", label: "Title", type: "text", required: true, wide: true },
    ...(!fixed.contractorId ? [{ name: "contractorId", label: "Contractor", type: "select" as const, options: contractors.map((c) => [c.id, c.name] as [string, string]), required: true }] : []),
    ...(!fixed.projectId ? [{ name: "projectId", label: "Project", type: "select" as const, options: projects.map((p) => [p.id, p.name] as [string, string]), empty: "No project" }] : []),
    { name: "status", label: "Status", type: "select", options: SOW_STATUSES.map((s) => [s, SOW_STATUS_LABEL[s]]) },
    { name: "value", label: "Value ($)", type: "money" },
    { name: "start", label: "Start", type: "date" },
    { name: "end", label: "End", type: "date" },
    { name: "body", label: "Scope", type: "markdown", placeholder: "## Scope\n- …\n\n## Exclusions\n- …" },
  ];
  return (
    <section>
      <Header title="Scopes of work" addLabel="Scope" onAdd={() => setEditing("new")} />
      {scopes.length ? (
        <div className="grid gap-3">
          {scopes.map((s) => (
            <article key={s.id} className="rounded-[12px] border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[14px] font-[510] text-fg-hi">{s.title}</h3>
                <ScopeBadge status={s.status} />
                <span className="flex-1" />
                <span className="font-mono text-[13px] text-fg-hi">{money(s.valueCents)}</span>
                <Button size="icon-sm" variant="ghost" aria-label={`Edit ${s.title}`} onClick={() => setEditing(s)}>
                  <Pencil />
                </Button>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {[fixed.contractorId ? null : s.company, fixed.projectId ? null : s.projectName, s.start || s.end ? `${formatDay(s.start)} – ${formatDay(s.end)}` : null].filter(Boolean).join(" · ")}
              </p>
              {s.body && <Markdown source={s.body} className="mt-3" />}
              {s.attachments.length > 0 && (
                <div className="mt-3">
                  <AttachmentList items={s.attachments} />
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-[12px] border border-dashed border-line px-6 py-8 text-center text-[13px] text-muted">No scopes of work yet.</p>
      )}
      {editing && (
        <RecordDialog
          open
          title={current ? current.title : "New scope of work"}
          fields={fields}
          initial={current ? { ...current, projectId: current.projectId ?? "", value: String(current.valueCents / 100), start: current.start ?? "", end: current.end ?? "" } : { status: "draft" }}
          files={{ label: "Signed scope, drawings, quotes", items: current?.attachments ?? [] }}
          onSave={async (v, attachments) =>
            asResult(
              await saveScopeAction(
                { title: v.title, contractorId: fixed.contractorId ?? v.contractorId, projectId: fixed.projectId ?? orNull(v.projectId), status: v.status as SowStatus, value: num(v.value), start: orNull(v.start), end: orNull(v.end), body: v.body, attachments },
                current?.id,
              ),
            )
          }
          onDelete={current ? async () => asResult(await deleteScopeAction(current.id)) : undefined}
          confirmDelete={current ? `Delete “${current.title}”?` : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

// ---------- Site access ----------

export function AccessSection({ rows, contractors, fixedContractorId, title = "Site access" }: { rows: Access[]; contractors: Opt[]; fixedContractorId?: string; title?: string }) {
  const [editing, setEditing] = useState<Access | "new" | null>(null);
  const current = editing === "new" ? null : editing;
  const fields: FieldSpec[] = [
    { name: "who", label: "Who", type: "text", required: true, placeholder: "Summit Rigging crew (4)" },
    ...(!fixedContractorId ? [{ name: "contractorId", label: "Contractor", type: "select" as const, options: contractors.map((c) => [c.id, c.name] as [string, string]), empty: "None" }] : []),
    { name: "from", label: "First day", type: "date", required: true },
    { name: "to", label: "Last day", type: "date" },
    { name: "hours", label: "Hours", type: "text", placeholder: "7:00 AM – 5:00 PM" },
    { name: "areas", label: "Areas", type: "text", placeholder: "Sanctuary, catwalk" },
    { name: "badge", label: "Keys / badge", type: "text" },
    { name: "approvedBy", label: "Approved by", type: "text" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
  return (
    <section>
      <Header title={title} addLabel="Access window" onAdd={() => setEditing("new")} />
      <DataTable
        label={title}
        rows={rows}
        onRow={setEditing}
        search={false}
        csv="site-access"
        empty="No site access scheduled."
        columns={[
          { key: "who", label: "Who", render: (a) => (
            <span>
              {a.who}
              {!fixedContractorId && a.company && <span className="block text-xs font-normal text-muted">{a.company}</span>}
            </span>
          ) },
          { key: "from", label: "Dates", value: (a) => `${a.from ?? ""} – ${a.to ?? a.from ?? ""}`, render: (a) => `${formatDay(a.from, { month: "short", day: "numeric" })} – ${formatDay(a.to ?? a.from, { month: "short", day: "numeric" })}` },
          { key: "hours", label: "Hours" },
          { key: "areas", label: "Areas" },
          { key: "badge", label: "Keys / badge", render: (a) => <span className="font-mono text-xs">{a.badge}</span> },
          { key: "approvedBy", label: "Approved by", className: "max-md:hidden" },
        ]}
      />
      {editing && (
        <RecordDialog
          open
          title={current ? `Site access: ${current.who}` : "Schedule site access"}
          fields={fields}
          initial={current ? { ...current, contractorId: current.contractorId ?? "", from: current.from ?? "", to: current.to ?? "" } : { contractorId: fixedContractorId ?? "" }}
          onSave={async (v) => asResult(await saveAccessAction({ who: v.who, from: v.from, hours: v.hours, areas: v.areas, badge: v.badge, approvedBy: v.approvedBy, notes: v.notes, contractorId: fixedContractorId ?? orNull(v.contractorId), to: orNull(v.to) }, current?.id))}
          onDelete={current ? async () => asResult(await deleteAccessAction(current.id)) : undefined}
          confirmDelete={current ? "Delete this access window?" : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

// ---------- Punch list ----------

export function PunchSection({ rows, contractors, projects, fixed, today, title = "Punch list", csv = "punch-list" }: { rows: Punch[]; contractors: Opt[]; projects: Opt[]; fixed: { contractorId?: string; projectId?: string }; today: string; title?: string; csv?: string }) {
  const [editing, setEditing] = useState<Punch | "new" | null>(null);
  const current = editing === "new" ? null : editing;
  const fields: FieldSpec[] = [
    { name: "description", label: "What needs doing", type: "text", required: true, wide: true },
    { name: "location", label: "Location", type: "text", placeholder: "Booth" },
    ...(!fixed.projectId ? [{ name: "projectId", label: "Project", type: "select" as const, options: projects.map((p) => [p.id, p.name] as [string, string]), required: true }] : []),
    ...(!fixed.contractorId ? [{ name: "contractorId", label: "Contractor", type: "select" as const, options: contractors.map((c) => [c.id, c.name] as [string, string]), empty: "Unassigned" }] : []),
    { name: "status", label: "Status", type: "select", options: PUNCH_STATUSES.map((s) => [s, PUNCH_STATUS_LABEL[s]]) },
    { name: "due", label: "Due", type: "date" },
  ];
  return (
    <section>
      <Header title={title} addLabel="Punch item" onAdd={() => setEditing("new")} />
      <DataTable
        label={title}
        rows={rows}
        onRow={setEditing}
        csv={csv}
        empty="No punch items. Add one while walking the site."
        columns={[
          { key: "description", label: "Item", render: (x) => (
            <span>
              {x.description}
              {x.photos.length > 0 && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-normal text-muted">
                  <Camera className="size-3" /> {x.photos.length}
                </span>
              )}
            </span>
          ) },
          { key: "location", label: "Location" },
          ...(!fixed.projectId ? [{ key: "projectName", label: "Project" }] : []),
          ...(!fixed.contractorId ? [{ key: "company", label: "Contractor" }] : []),
          { key: "due", label: "Due", render: (x: Punch) => <span className={cn(isOverdue({ due: x.due, status: x.status === "closed" ? "done" : "open" }, today) && "text-bad")}>{formatDay(x.due, { month: "short", day: "numeric" })}</span> },
          { key: "status", label: "Status", value: (x: Punch) => PUNCH_STATUS_LABEL[x.status], render: (x: Punch) => <PunchBadge status={x.status} /> },
        ]}
      />
      {editing && (
        <RecordDialog
          open
          title={current ? "Punch item" : "New punch item"}
          fields={fields}
          initial={current ? { ...current, contractorId: current.contractorId ?? "", due: current.due ?? "" } : { status: "open", projectId: fixed.projectId ?? projects[0]?.id ?? "", contractorId: fixed.contractorId ?? "" }}
          files={{ label: "Photos", items: current?.photos ?? [], photos: true }}
          onSave={async (v, photos) =>
            asResult(
              await savePunchAction(
                { description: v.description, location: v.location, projectId: fixed.projectId ?? v.projectId, contractorId: fixed.contractorId ?? orNull(v.contractorId), status: v.status as PunchStatus, due: orNull(v.due), photos },
                current?.id,
              ),
            )
          }
          onDelete={current ? async () => asResult(await deletePunchAction(current.id)) : undefined}
          confirmDelete={current ? "Delete this punch item?" : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

// ---------- Invoices ----------

export function InvoiceSection({ rows, contractors, projects, fixed, csv = "invoices" }: { rows: Invoice[]; contractors: Opt[]; projects: Opt[]; fixed: { contractorId?: string; projectId?: string }; csv?: string }) {
  const [editing, setEditing] = useState<Invoice | "new" | null>(null);
  const current = editing === "new" ? null : editing;
  const fields: FieldSpec[] = [
    { name: "number", label: "Invoice #", type: "text" },
    { name: "amount", label: "Amount ($)", type: "money", required: true },
    ...(!fixed.contractorId ? [{ name: "contractorId", label: "Contractor", type: "select" as const, options: contractors.map((c) => [c.id, c.name] as [string, string]), required: true }] : []),
    ...(!fixed.projectId ? [{ name: "projectId", label: "Project", type: "select" as const, options: projects.map((p) => [p.id, p.name] as [string, string]), empty: "No project" }] : []),
    { name: "date", label: "Date", type: "date" },
    { name: "dueDate", label: "Due", type: "date" },
    { name: "status", label: "Status", type: "select", options: INVOICE_STATUSES.map((s) => [s, INVOICE_STATUS_LABEL[s]]) },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
  return (
    <section>
      <Header title="Invoices" addLabel="Invoice" onAdd={() => setEditing("new")} />
      <DataTable
        label="Invoices"
        rows={rows}
        onRow={setEditing}
        search={false}
        csv={csv}
        empty="No invoices yet."
        columns={[
          { key: "number", label: "Invoice #", render: (x) => (
            <span className="font-mono">
              {x.number || "—"}
              {x.attachments.length > 0 && <Paperclip className="ml-1 inline size-3 text-muted" />}
            </span>
          ) },
          ...(!fixed.contractorId ? [{ key: "company", label: "Contractor" }] : []),
          ...(!fixed.projectId ? [{ key: "projectName", label: "Project" }] : []),
          { key: "date", label: "Date", render: (x: Invoice) => formatDay(x.date) },
          { key: "dueDate", label: "Due", render: (x: Invoice) => formatDay(x.dueDate) },
          { key: "amount", label: "Amount", align: "right" as const, value: (x: Invoice) => x.amountCents / 100, render: (x: Invoice) => <b className="font-mono text-xs font-[510] text-fg-hi">{money(x.amountCents)}</b> },
          { key: "status", label: "Status", value: (x: Invoice) => INVOICE_STATUS_LABEL[x.status], render: (x: Invoice) => <InvoiceBadge status={x.status} /> },
        ]}
      />
      {editing && (
        <RecordDialog
          open
          title={current ? `Invoice ${current.number}` : "Log an invoice"}
          fields={fields}
          initial={current ? { ...current, amount: String(current.amountCents / 100), contractorId: current.contractorId ?? "", projectId: current.projectId ?? "", date: current.date ?? "", dueDate: current.dueDate ?? "" } : { status: "received", projectId: fixed.projectId ?? "", contractorId: fixed.contractorId ?? contractors[0]?.id ?? "" }}
          files={{ label: "Invoice PDF", items: current?.attachments ?? [] }}
          onSave={async (v, attachments) =>
            asResult(
              await saveInvoiceAction(
                { number: v.number, amount: num(v.amount), contractorId: fixed.contractorId ?? v.contractorId, projectId: fixed.projectId ?? orNull(v.projectId), date: orNull(v.date), dueDate: orNull(v.dueDate), status: v.status as InvoiceStatus, notes: v.notes, attachments },
                current?.id,
              ),
            )
          }
          onDelete={current ? async () => asResult(await deleteInvoiceAction(current.id)) : undefined}
          confirmDelete={current ? "Delete this invoice?" : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
