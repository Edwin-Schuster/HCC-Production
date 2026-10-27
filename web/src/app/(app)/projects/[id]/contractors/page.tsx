import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { listContractors, listInvoices, listPunch, listScopes } from "@/server/services/contractors";
import { loadProject } from "@/server/services/projects";
import { InvoiceSection, PunchSection, ScopesSection } from "@/components/work/contractors";
import { slug } from "@/lib/csv";
import { today } from "@/lib/work";

export const metadata: Metadata = { title: "Contractors" };

export default function ProjectContractorsPage(props: PageProps<"/projects/[id]/contractors">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/projects/[id]/contractors">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/projects/${id}/contractors`);
  const db = await getDb();
  const project = await loadProject(db, actor, id);
  const [contractors, punch, scopes, invoices] = await Promise.all([listContractors(db, actor), listPunch(db, actor, { projectId: id }), listScopes(db, actor, { projectId: id }), listInvoices(db, actor, { projectId: id })]);
  const opts = contractors.map((c) => ({ id: c.id, name: c.company }));
  const me = [{ id: project.id, name: project.name }];
  return (
    <div className="grid grid-cols-1 gap-10">
      <PunchSection rows={punch} contractors={opts} projects={me} fixed={{ projectId: id }} today={today()} csv={`punch-list-${slug(project.name)}`} />
      <ScopesSection scopes={scopes} contractors={opts} projects={me} fixed={{ projectId: id }} />
      <InvoiceSection rows={invoices} contractors={opts} projects={me} fixed={{ projectId: id }} csv={`invoices-${slug(project.name)}`} />
    </div>
  );
}
