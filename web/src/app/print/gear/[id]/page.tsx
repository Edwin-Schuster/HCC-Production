import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { AppError } from "@/server/errors";
import { getGear } from "@/server/services/gear";
import { getDefaultWorkspace } from "@/server/services/workspace";
import { GearLabel } from "@/components/work/gear-label";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Gear label", robots: { index: false } };

export default function GearLabelPage(props: PageProps<"/print/gear/[id]">) {
  return (
    <Suspense>
      <Label params={props.params} />
    </Suspense>
  );
}

async function Label({ params }: { params: PageProps<"/print/gear/[id]">["params"] }) {
  const { id } = await params;
  const actor = await requireRole("editor", `/print/gear/${id}`);
  const db = await getDb();
  let g;
  try {
    g = await getGear(db, actor, id);
  } catch (e) {
    if (e instanceof AppError && e.status < 500) notFound();
    throw e;
  }
  const ws = await getDefaultWorkspace(db);
  return (
    <div data-theme="light" className="min-h-dvh bg-white px-6 py-8 text-black print:p-0">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-[510]">Label · {g.name}</h1>
        <PrintButton />
      </div>
      <GearLabel g={g} org={ws?.name ?? "HCC Production"} />
    </div>
  );
}
