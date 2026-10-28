import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { atLeast } from "@/server/permissions";
import { linkableUsers, listRoster } from "@/server/services/roster";
import { Page } from "@/components/page";
import { RosterView } from "./roster-view";

export const metadata: Metadata = { title: "Roster" };

export default function RosterPage(props: PageProps<"/roster">) {
  return (
    <Page wide>
      <Suspense fallback={<div className="h-96" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/roster">["searchParams"] }) {
  const sp = await searchParams;
  const actor = await requireRole("viewer", "/roster");
  const db = await getDb();
  const editor = atLeast(actor, "editor");
  const [roster, accounts] = await Promise.all([listRoster(db, actor), editor ? linkableUsers(db, actor) : Promise.resolve([])]);
  return <RosterView {...roster} accounts={accounts} canEdit={editor} checkIn={sp.checkin === "1"} />;
}
