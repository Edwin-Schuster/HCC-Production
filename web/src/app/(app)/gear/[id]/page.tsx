import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronLeft, Printer } from "lucide-react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { AppError } from "@/server/errors";
import { getGear } from "@/server/services/gear";
import { getDefaultWorkspace } from "@/server/services/workspace";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfigSection, FirmwareSection, GearButton, GearPhotos, GearStatusBadge } from "@/components/work/gear";
import { GearLabel } from "@/components/work/gear-label";
import { formatDay } from "@/lib/format";

export const metadata: Metadata = { title: "Gear" };

export default function GearItemPage(props: PageProps<"/gear/[id]">) {
  return (
    <Page wide>
      <Suspense fallback={<div className="h-96" />}>
        <Content params={props.params} />
      </Suspense>
    </Page>
  );
}

async function Content({ params }: { params: PageProps<"/gear/[id]">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/gear/${id}`);
  const db = await getDb();
  let g;
  try {
    g = await getGear(db, actor, id);
  } catch (e) {
    if (e instanceof AppError && e.status < 500) notFound();
    throw e;
  }
  const ws = await getDefaultWorkspace(db);
  const facts: [string, string, boolean?][] = [
    ["Category", g.category],
    ["Manufacturer", g.manufacturer],
    ["Model", g.model],
    ["Serial number", g.serial, true],
    ["Asset tag", g.assetTag, true],
    ["Location", g.location],
    ["IP address", g.ip, true],
    ["MAC address", g.mac, true],
    ["Purchased", g.purchaseDate ? formatDay(g.purchaseDate) : ""],
    ["Warranty until", g.warranty ? formatDay(g.warranty) : ""],
  ];
  return (
    <>
      <Link href="/gear" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg-hi">
        <ChevronLeft className="size-3.5" /> Gear
      </Link>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2.5 text-[22px] font-[510] tracking-[-0.012em] text-fg-hi sm:text-2xl">
            {g.name} <GearStatusBadge status={g.status} />
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">{[g.manufacturer, g.model].filter(Boolean).join(" ")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href={`/print/gear/${g.id}`} target="_blank">
              <Printer /> Label
            </Link>
          </Button>
          <GearButton item={g} />
        </div>
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-[12px] border border-line bg-surface p-4">
          <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            {facts
              .filter(([, v]) => v)
              .map(([k, v, mono]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className={mono ? "select-all font-mono text-xs leading-5" : undefined}>{v}</dd>
                </div>
              ))}
          </dl>
          {g.notes && <p className="mt-3 whitespace-pre-line text-[13px] text-fg-2">{g.notes}</p>}
        </section>
        <section className="grid content-start gap-4 rounded-[12px] border border-line bg-surface p-4">
          <h2 className="text-[15px] font-[510]">Firmware</h2>
          <GearLabel g={g} org={ws?.name ?? "HCC Production"} />
          <FirmwareSection item={g} />
        </section>
      </div>
      <section className="mt-6 rounded-[12px] border border-line bg-surface p-4">
        <h2 className="mb-3 text-[15px] font-[510]">Config backups</h2>
        <ConfigSection item={g} />
      </section>
      <section className="mt-6 rounded-[12px] border border-line bg-surface p-4">
        <h2 className="mb-3 text-[15px] font-[510]">Photos</h2>
        <GearPhotos item={g} />
      </section>
    </>
  );
}
