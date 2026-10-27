import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { listProjects } from "@/server/services/projects";
import { listPurchaseOrders, nextPoNumber } from "@/server/services/purchasing";
import { Page, PageHeader } from "@/components/page";
import { Stat } from "@/components/work/overview";
import { PurchaseOrders } from "@/components/work/purchasing";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Purchasing" };

export default function PurchasingPage() {
  return (
    <Page wide>
      <PageHeader title="Purchasing" subtitle="Every purchase order across projects. Receive deliveries here or on a project's Budget tab." />
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
  const open = orders.filter((o) => !["received", "cancelled", "draft"].includes(o.status));
  const awaiting = open.reduce((s, o) => s + o.totalCents - o.receivedCents, 0);
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open orders" value={open.length} sub="Submitted, approved or on the way" />
        <Stat label="Still to arrive" value={formatMoney(awaiting)} sub="Value not yet received" />
        <Stat label="Drafts" value={orders.filter((o) => o.status === "draft").length} sub="Not sent to a vendor yet" />
      </div>
      <PurchaseOrders orders={orders} projects={projects.map((p) => ({ id: p.id, name: p.name }))} nextNumber={next} csvName="purchase-orders" />
    </div>
  );
}
