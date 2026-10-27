import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { AppError } from "@/server/errors";
import { getContractor, listAccess, listInvoices, listPunch, listScopes } from "@/server/services/contractors";
import { listProjects } from "@/server/services/projects";
import { Page } from "@/components/page";
import { AccessSection, ContractorButton, InvoiceSection, PunchSection, ScopesSection } from "@/components/work/contractors";
import { AttachmentList } from "@/components/work/task-drawer";
import { slug } from "@/lib/csv";
import { formatDay } from "@/lib/format";
import { today } from "@/lib/work";

export const metadata: Metadata = { title: "Contractor" };

export default function ContractorPage(props: PageProps<"/contractors/[id]">) {
  return (
    <Page wide>
      <Suspense fallback={<div className="h-96" />}>
        <Content params={props.params} />
      </Suspense>
    </Page>
  );
}

async function Content({ params }: { params: PageProps<"/contractors/[id]">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/contractors/${id}`);
  const db = await getDb();
  let c;
  try {
    c = await getContractor(db, actor, id);
  } catch (e) {
    if (e instanceof AppError && e.status < 500) notFound();
    throw e;
  }
  const [scopes, access, punch, invoices, projects] = await Promise.all([listScopes(db, actor, { contractorId: id }), listAccess(db, actor, { contractorId: id }), listPunch(db, actor, { contractorId: id }), listInvoices(db, actor, { contractorId: id }), listProjects(db, actor)]);
  const projectOpts = projects.map((p) => ({ id: p.id, name: p.name }));
  const me = [{ id: c.id, name: c.company }];
  return (
    <>
      <Link href="/contractors" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg-hi">
        <ChevronLeft className="size-3.5" /> Contractors
      </Link>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-[510] tracking-[-0.012em] text-fg-hi sm:text-2xl">{c.company}</h1>
          {c.trade && <p className="mt-0.5 text-[13px] text-muted">{c.trade}</p>}
        </div>
        <ContractorButton contractor={c} />
      </header>
      {c.insurance === "expired" || c.insurance === "expiring" ? (
        <p role="alert" className={`mb-4 flex items-start gap-2 rounded-[8px] border px-3 py-2 text-[13px] ${c.insurance === "expired" ? "border-bad/40 bg-bad-soft text-bad" : "border-warn/40 bg-warn-soft text-warn"}`}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {c.insurance === "expired" ? `Insurance expired ${formatDay(c.insuranceExpires)}. Get a new certificate before granting site access.` : `Insurance expires ${formatDay(c.insuranceExpires)}. Ask for a renewed certificate.`}
        </p>
      ) : null}
      <section className="mb-8 grid gap-4 rounded-[12px] border border-line bg-surface p-4 md:grid-cols-2">
        <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          <dt className="text-muted">Contact</dt>
          <dd>{c.contact || "—"}</dd>
          <dt className="text-muted">Phone</dt>
          <dd className="font-mono text-xs">{c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a> : "—"}</dd>
          <dt className="text-muted">Email</dt>
          <dd className="font-mono text-xs">{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "—"}</dd>
          <dt className="text-muted">Rate</dt>
          <dd>{c.rate || "—"}</dd>
          <dt className="text-muted">Insurance until</dt>
          <dd>{formatDay(c.insuranceExpires)}</dd>
        </dl>
        <div className="grid content-start gap-2">
          {c.notes && <p className="whitespace-pre-line text-[13px] text-fg-2">{c.notes}</p>}
          <h2 className="text-xs font-[510] text-muted">Documents</h2>
          <AttachmentList items={c.attachments} />
        </div>
      </section>
      <div className="grid grid-cols-1 gap-10">
        <ScopesSection scopes={scopes} contractors={me} projects={projectOpts} fixed={{ contractorId: c.id }} />
        <AccessSection rows={access} contractors={me} fixedContractorId={c.id} />
        <PunchSection rows={punch} contractors={me} projects={projectOpts} fixed={{ contractorId: c.id }} today={today()} csv={`punch-${slug(c.company)}`} />
        <InvoiceSection rows={invoices} contractors={me} projects={projectOpts} fixed={{ contractorId: c.id }} csv={`invoices-${slug(c.company)}`} />
      </div>
    </>
  );
}
