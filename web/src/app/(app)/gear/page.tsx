import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Printer } from "lucide-react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { listGear } from "@/server/services/gear";
import { Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { GearButton, GearList } from "@/components/work/gear";

export const metadata: Metadata = { title: "Gear" };

export default function GearPage() {
  return (
    <Page wide>
      <Suspense fallback={<div className="h-96" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("editor", "/gear");
  const items = await listGear(await getDb(), actor);
  return (
    <>
      <PageHeader
        title="Gear inventory"
        subtitle={`${items.length} items · ${items.filter((g) => g.status === "in_service").length} in service`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/print/gear" target="_blank">
                <Printer /> Labels
              </Link>
            </Button>
            <GearButton />
          </>
        }
      />
      <GearList items={items} />
    </>
  );
}
