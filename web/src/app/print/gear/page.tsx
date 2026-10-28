import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { listGear } from "@/server/services/gear";
import { getDefaultWorkspace } from "@/server/services/workspace";
import { GearLabel } from "@/components/work/gear-label";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Gear labels", robots: { index: false } };

/** Labels for every item in service (or ?category=Audio). */
export default function GearLabelsPage(props: PageProps<"/print/gear">) {
  return (
    <Suspense>
      <Labels searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Labels({ searchParams }: { searchParams: PageProps<"/print/gear">["searchParams"] }) {
  const sp = await searchParams;
  const actor = await requireRole("editor", "/print/gear");
  const db = await getDb();
  const category = typeof sp.category === "string" ? sp.category : "";
  const [items, ws] = await Promise.all([listGear(db, actor), getDefaultWorkspace(db)]);
  const shown = items.filter((g) => g.status !== "retired" && (!category || g.category === category));
  return (
    <div data-theme="light" className="min-h-dvh bg-white px-6 py-8 text-black print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-[510]">Gear labels{category && ` · ${category}`}</h1>
          <p className="text-[13px] text-black/60">{shown.length} labels for gear that isn&apos;t retired.</p>
        </div>
        <PrintButton />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(3.2in,1fr))] gap-3 print:grid-cols-2 print:gap-2">
        {shown.map((g) => (
          <GearLabel key={g.id} g={g} org={ws?.name ?? "HCC Production"} />
        ))}
      </div>
    </div>
  );
}
