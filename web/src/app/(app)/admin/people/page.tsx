import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { listMembers } from "@/server/services/workspace";
import { Page, PageHeader } from "@/components/page";
import { PeopleManager } from "./people-manager";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage() {
  return (
    <Page>
      <PageHeader title="People & roles" subtitle="Admins manage everything. Editors write and publish SOPs. Viewers read SOPs in folders open to team members." />
      <Suspense fallback={<div className="h-96" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("admin", "/admin/people");
  const members = await listMembers(await getDb(), actor);
  return <PeopleManager members={members} selfId={actor.userId!} />;
}
