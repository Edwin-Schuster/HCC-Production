import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { loadProject } from "@/server/services/projects";
import { listBom, listPurchaseOrders, nextPoNumber, projectBudget } from "@/server/services/purchasing";
import { Stat } from "@/components/work/overview";
import { BomSection, PurchaseOrders } from "@/components/work/purchasing";
import { formatMoney } from "@/lib/format";
import { slug } from "@/lib/csv";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Budget" };

export default function BudgetPage(props: PageProps<"/projects/[id]/budget">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

const pct = (n: number, of: number) => (of ? (n / of) * 100 : 0);

async function Content({ params }: { params: PageProps<"/projects/[id]/budget">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/projects/${id}/budget`);
  const db = await getDb();
  const project = await loadProject(db, actor, id);
  const [b, bom, orders, next] = await Promise.all([projectBudget(db, actor, id), listBom(db, actor, id), listPurchaseOrders(db, actor, id), nextPoNumber(db, actor)]);
  const spentPct = Math.min(100, pct(b.spent, b.budget));
  const committedPct = Math.max(0, Math.min(100, pct(b.committed, b.budget)) - spentPct);
  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Budget" value={formatMoney(b.budget)} sub="Change it with Edit, above" />
          <Stat label="Planned (BOM)" value={formatMoney(b.planned)} sub={b.budget ? `${Math.round(pct(b.planned, b.budget))}% of budget` : undefined} pct={b.budget ? pct(b.planned, b.budget) : undefined} />
          <Stat label="Committed" value={formatMoney(b.committed)} sub="Purchase orders and signed scopes of work" pct={b.budget ? pct(b.committed, b.budget) : undefined} tone={b.committed > b.budget && b.budget ? "bad" : undefined} />
          <Stat label="Spent" value={formatMoney(b.spent)} sub="Goods received and invoices paid" pct={b.budget ? pct(b.spent, b.budget) : undefined} />
          <Stat label="Remaining" value={formatMoney(b.remaining)} sub="Budget minus committed" tone={b.remaining < 0 ? "bad" : undefined} />
        </div>
        {b.budget > 0 && (
          <div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-wash" role="img" aria-label={`${Math.round(spentPct)}% spent, ${Math.round(pct(b.committed, b.budget))}% committed`}>
              <span className="h-full bg-fg-2" style={{ width: `${spentPct}%` }} />
              <span className={cn("h-full", b.committed > b.budget ? "bg-bad" : "bg-iris")} style={{ width: `${committedPct}%` }} />
            </div>
            <p className="mt-1.5 flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-fg-2" /> Spent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-iris" /> Committed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-wash ring-1 ring-line" /> Available
              </span>
            </p>
          </div>
        )}
      </div>

      {b.byCategory.length > 0 && (
        <section aria-labelledby="cat-h">
          <h2 id="cat-h" className="mb-2 text-[15px] font-[510]">
            By category
          </h2>
          <div className="overflow-x-auto rounded-[12px] border border-line bg-surface">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-3 py-2 font-normal">Category</th>
                  <th className="px-3 py-2 text-right font-normal">Planned</th>
                  <th className="px-3 py-2 text-right font-normal">Committed</th>
                  <th className="px-3 py-2 text-right font-normal">Spent</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {b.byCategory.map((c) => (
                  <tr key={c.category} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-sans text-[13px] text-fg-hi">{c.category}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(c.planned)}</td>
                    <td className={cn("px-3 py-2 text-right", c.planned && c.committed > c.planned && "text-warn")}>{formatMoney(c.committed)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(c.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <BomSection projectId={id} projectName={project.name} items={bom} />
      <PurchaseOrders orders={orders} projectId={id} bom={bom} nextNumber={next} csvName={`purchase-orders-${slug(project.name)}`} />
    </div>
  );
}
