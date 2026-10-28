import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { AppError } from "@/server/errors";
import { listActivity } from "@/server/services/activity";
import { cableSummary, listCables } from "@/server/services/cabling";
import { listPunch } from "@/server/services/contractors";
import { getProject, type Project } from "@/server/services/projects";
import { listPurchaseOrders, projectBudget } from "@/server/services/purchasing";
import { assignableMembers, listTasks } from "@/server/services/tasks";
import { PrintButton } from "@/components/print-button";
import { Markdown } from "@/components/markdown";
import { CABLE_STATUSES, CABLE_STATUS_LABEL } from "@/lib/cabling";
import { PUNCH_STATUS_LABEL } from "@/lib/contractors";
import { formatDay, formatMoney } from "@/lib/format";
import { PO_STATUS_LABEL } from "@/lib/purchasing";
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL, TASK_STATUS_LABEL, isOverdue, today } from "@/lib/work";

export const metadata: Metadata = { title: "Project report", robots: { index: false } };

/** A one-document status report for leadership: progress, budget, schedule, cabling and open items. */
export default function ReportPage(props: PageProps<"/print/project/[id]">) {
  return (
    <Suspense>
      <Report params={props.params} />
    </Suspense>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7 break-inside-avoid-page">
      <h2 className="mb-2 border-b border-black/20 pb-1 text-[15px] font-[600] text-black">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows, right = [] }: { head: string[]; rows: ReactNode[][]; right?: number[] }) {
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="text-left text-black/60">
          {head.map((h, i) => (
            <th key={h} className={`border-b border-black/15 py-1 pr-3 font-[500] ${right.includes(i) ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="break-inside-avoid">
            {r.map((c, j) => (
              <td key={j} className={`border-b border-black/10 py-1 pr-3 align-top ${right.includes(j) ? "text-right font-mono" : ""}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function Report({ params }: { params: PageProps<"/print/project/[id]">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/print/project/${id}`);
  const db = await getDb();
  let p: Project;
  try {
    p = (await getProject(db, actor, id)) as Project;
  } catch (e) {
    if (e instanceof AppError && e.status < 500) notFound();
    throw e;
  }
  const [tasks, members, budget, cables, punch, orders, history] = await Promise.all([
    listTasks(db, actor, id),
    assignableMembers(db, actor),
    projectBudget(db, actor, id),
    listCables(db, actor, id),
    listPunch(db, actor, { projectId: id, open: true }),
    listPurchaseOrders(db, actor, id),
    listActivity(db, actor, { projectId: id }, 15),
  ]);
  const t = today();
  const names = new Map(members.map((m) => [m.id, m.name]));
  const open = tasks.filter((x) => x.status !== "done").sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));
  const overdue = open.filter((x) => isOverdue(x, t));
  const cs = cableSummary(cables);
  const pct = p.progress.total ? Math.round((p.progress.done / p.progress.total) * 100) : 0;
  const openOrders = orders.filter((o) => !["received", "cancelled", "draft"].includes(o.status));
  return (
    <div data-theme="light" className="mx-auto min-h-dvh max-w-[8.5in] bg-white px-8 py-10 text-[13px] text-[#1d1e21] print:max-w-none print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton label="Print or save as PDF" />
      </div>
      <header className="border-b-2 border-black pb-3">
        <p className="text-[11px] uppercase tracking-[0.08em] text-black/60">Project report · {formatDay(t)}</p>
        <h1 className="mt-1 text-[24px] font-[600] text-black">{p.name}</h1>
        <p className="mt-1 text-black/70">
          {PROJECT_STATUS_LABEL[p.status]} · {formatDay(p.start)} → {formatDay(p.end)}
          {p.leadName && ` · Lead: ${p.leadName}`}
        </p>
        {p.summary && <p className="mt-2">{p.summary}</p>}
      </header>

      <div className="mt-5 grid grid-cols-4 gap-3">
        {[
          ["Tasks done", `${pct}%`, `${p.progress.done} of ${p.progress.total}${overdue.length ? ` · ${overdue.length} overdue` : ""}`],
          ["Budget committed", formatMoney(budget.committed), `of ${formatMoney(budget.budget)}`],
          ["Remaining", formatMoney(budget.remaining), `${formatMoney(budget.spent)} spent`],
          ["Cables", `${cs.total}`, `${cs.totalFt.toLocaleString()} ft`],
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-[6px] border border-black/15 p-2.5">
            <div className="text-[11px] text-black/60">{label}</div>
            <div className="text-[18px] font-[600] text-black">{value}</div>
            <div className="text-[11px] text-black/60">{sub}</div>
          </div>
        ))}
      </div>

      {p.description && (
        <Section title="About">
          <Markdown source={p.description} className="text-[13px] text-[#1d1e21]" />
        </Section>
      )}

      <Section title={`Open tasks (${open.length})`}>
        {open.length ? (
          <Table
            head={["Task", "Status", "Priority", "Assigned", "Due"]}
            rows={open.map((x) => [x.title, TASK_STATUS_LABEL[x.status], PRIORITY_LABEL[x.priority], x.assignees.map((u) => names.get(u)).filter(Boolean).join(", "), <span key="d" className={isOverdue(x, t) ? "font-[600] text-[#c53030]" : ""}>{formatDay(x.due)}</span>])}
          />
        ) : (
          <p className="text-black/60">Every task is done.</p>
        )}
      </Section>

      <Section title="Budget">
        <Table
          head={["Category", "Planned", "Committed", "Spent"]}
          right={[1, 2, 3]}
          rows={[...budget.byCategory.map((c) => [c.category, formatMoney(c.planned), formatMoney(c.committed), formatMoney(c.spent)]), [<b key="t">Total</b>, formatMoney(budget.planned), formatMoney(budget.committed), formatMoney(budget.spent)]]}
        />
        {openOrders.length > 0 && (
          <div className="mt-3">
            <Table head={["Open purchase order", "Vendor", "Status", "Total"]} right={[3]} rows={openOrders.map((o) => [o.poNumber, o.vendor, PO_STATUS_LABEL[o.status], formatMoney(o.totalCents)])} />
          </div>
        )}
      </Section>

      {cs.total > 0 && (
        <Section title="Cabling">
          <p>{CABLE_STATUSES.filter((s) => cs.byStatus[s]).map((s) => `${cs.byStatus[s]} ${CABLE_STATUS_LABEL[s].toLowerCase()}`).join(" · ")}</p>
          <p className="mt-1 text-black/70">{cs.byType.map((x) => `${x.type}: ${x.ft.toLocaleString()} ft`).join(" · ")}</p>
        </Section>
      )}

      {punch.length > 0 && (
        <Section title={`Open punch items (${punch.length})`}>
          <Table head={["Item", "Location", "Contractor", "Status", "Due"]} rows={punch.map((x) => [x.description, x.location, x.company ?? "", PUNCH_STATUS_LABEL[x.status], formatDay(x.due)])} />
        </Section>
      )}

      {history.length > 0 && (
        <Section title="Recent activity">
          <ul className="grid gap-0.5">
            {history.map((a) => (
              <li key={a.id}>
                <span className="text-black/60">{formatDay(a.createdAt.slice(0, 10), { month: "short", day: "numeric" })}</span> · <b className="font-[600]">{a.actorName ?? "Someone"}</b> {a.text}
                {a.targetType !== "project" && <span className="text-black/60"> · “{a.targetName}”</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
