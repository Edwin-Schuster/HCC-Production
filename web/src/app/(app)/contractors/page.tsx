import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { listAccess, listContractors, listPunch } from "@/server/services/contractors";
import { listProjects } from "@/server/services/projects";
import { Empty, Page, PageHeader } from "@/components/page";
import { AccessSection, ContractorButton, InsuranceNote, PunchSection } from "@/components/work/contractors";
import { formatMoney } from "@/lib/format";
import { today } from "@/lib/work";

export const metadata: Metadata = { title: "Contractors" };

export default function ContractorsPage() {
  return (
    <Page wide>
      <Suspense fallback={<div className="h-96" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("editor", "/contractors");
  const db = await getDb();
  const [list, access, punch, projects] = await Promise.all([listContractors(db, actor), listAccess(db, actor, { upcoming: true }), listPunch(db, actor, { open: true }), listProjects(db, actor)]);
  const opts = list.map((c) => ({ id: c.id, name: c.company }));
  return (
    <>
      <PageHeader title="Contractors" subtitle="Directory, scopes of work, site access, punch lists and invoices." actions={<ContractorButton />} />
      {list.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/contractors/${c.id}`} className="flex h-full flex-col gap-1 rounded-[12px] border border-line bg-surface p-4 hover:border-line-2 hover:bg-wash-2">
                {c.trade && <span className="text-xs text-muted">{c.trade}</span>}
                <span className="text-[15px] font-[510] text-fg-hi">{c.company}</span>
                {c.contact && <span className="text-[13px] text-fg-2">{c.contact}</span>}
                <span className="mt-auto flex flex-wrap gap-x-3 pt-2 text-xs text-muted">
                  <span>{c.openPunch} open punch</span>
                  <span>{formatMoney(c.unpaidCents)} unpaid</span>
                  <InsuranceNote c={c} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No contractors yet">Add the companies that work on your building.</Empty>
      )}
      <div className="mt-10 grid grid-cols-1 gap-10">
        <AccessSection rows={access} contractors={opts} title="Upcoming site access" />
        <PunchSection rows={punch} contractors={opts} projects={projects.map((p) => ({ id: p.id, name: p.name }))} fixed={{}} today={today()} title="All open punch items" />
      </div>
    </>
  );
}
