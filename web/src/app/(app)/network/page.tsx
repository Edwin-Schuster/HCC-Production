import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { listPorts, projectsWithNetwork } from "@/server/services/network";
import { Page, PageHeader } from "@/components/page";
import { NetworkView } from "@/components/work/network-view";

export const metadata: Metadata = { title: "Network" };

/** The church's own network: every switch, port and device in one place, apart from any project. */
export default function NetworkPage() {
  return (
    <Page wide>
      <PageHeader title="Network" subtitle="Every switch, port and Wi-Fi device: VLANs, reserved IPs, MAC addresses and what's plugged in where." />
      <Suspense fallback={<div className="h-96" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("editor", "/network");
  const db = await getDb();
  const [ports, sources] = await Promise.all([listPorts(db, actor, null), projectsWithNetwork(db, actor)]);
  return <NetworkView projectId={null} projectName="HCC" ports={ports} sources={sources} />;
}
