import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { listProjects } from "@/server/services/projects";
import Link from "next/link";
import { listPurchaseOrders, nextPoNumber, projectBudget } from "@/server/services/purchasing";
import { Meter } from "@/components/work/badges";
import { cn } from "@/lib/utils";
import { Page, PageHeader } from "@/components/page";
import { Stat } from "@/components/work/overview";
import { PurchaseOrders } from "@/components/work/purchasing";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Budgets" };

export default function PurchasingPage() {
  return (
    <Page wide>
      <PageHeader title="Budgets" subtitle="Every project budget, purchase order and delivery in one place." />
      <Suspense fallback={<div className="h-96" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("editor", "/purchasing");
  const db = await getDb();
  const [orders, projects, next] = await Promise.all([listPurchaseOrders(db, actor), listProjects(db, actor), nextPoNumber(db, actor)]);
  const budgets = await Promise.all(projects.map(async (p) => ({ p, b: await projectBudget(db, actor, p.id) })));
  const total = budgets.reduce((a, { b }) => ({ budget: a.budget + b.budget, committed: a.committed + b.committed, spent: a.spent + b.spent }), { budget: 0, committed: 0, spent: 0 });
  const open = orders.filter((o) => !["received", "cancelled", "draft"].includes(o.status));
  const awaiting = open.reduce((s, o) => s + o.totalCents - o.receivedCents, 0);
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total budget" value={formatMoney(total.budget)} sub={`${projects.length} projects · ${formatMoney(total.committed)} committed`} pct={total.budget ? (total.committed / total.budget) * 100 : 0} />
        <Stat label="Open orders" value={open.length} sub="Submitted, approved or on the way" />
        <Stat label="Still to arrive" value={formatMoney(awaiting)} sub="Value not yet received" />
        <Stat label="Drafts" value={orders.filter((o) => o.status === "draft").length} sub="Not sent to a vendor yet" />
      </div>
      <section aria-labelledby="budgets-h">
        <h2 id="budgets-h" className="mb-2 text-[15px] font-[510]">
          Project budgets
        </h2>
        <div className="overflow-x-auto rounded-[12px] border border-line bg-surface">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-3 py-2 font-normal">Project</th>
                <th className="px-3 py-2 text-right font-normal">Budget</th>
                <th className="px-3 py-2 text-right font-normal">Planned</th>
                <th className="px-3 py-2 text-right font-normal">Committed</th>
                <th className="px-3 py-2 text-right font-normal">Spent</th>
                <th className="px-3 py-2 text-right font-normal">Remaining</th>
                <th className="w-32 px-3 py-2 font-normal">Used</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {budgets.map(({ p, b }) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-wash-2">
                  <td className="px-3 py-2 font-sans text-[13px]">
                    <Link href={`/projects/${p.id}/budget`} className="font-[510] text-fg-hi hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">{formatMoney(b.budget)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(b.planned)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(b.committed)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(b.spent)}</td>
                  <td className={cn("px-3 py-2 text-right", b.remaining < 0 && "text-bad")}>{formatMoney(b.remaining)}</td>
                  <td className="px-3 py-2">
                    <Meter pct={b.budget ? (b.committed / b.budget) * 100 : 0} tone={b.remaining < 0 ? "bad" : "fg"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PurchaseOrders orders={orders} projects={projects.map((p) => ({ id: p.id, name: p.name }))} nextNumber={next} csvName="purchase-orders" />
    </div>
  );
}
