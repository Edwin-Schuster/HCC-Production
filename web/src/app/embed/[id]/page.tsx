import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db";
import { getSopDocument } from "@/server/services/sops";
import { recordAnonymousView } from "@/server/services/analytics";
import { getDefaultWorkspace } from "@/server/services/workspace";
import { EmbeddedSop, EmbedMessage } from "@/components/sop/embedded-sop";

export const metadata: Metadata = { title: "SOP", robots: { index: false } };

/** Embeds a published SOP from a public folder. For other SOPs, embed a share link (/embed/s/…). */
export default function EmbedPage(props: PageProps<"/embed/[id]">) {
  return (
    <Suspense>
      <Embed params={props.params} />
    </Suspense>
  );
}

async function Embed({ params }: { params: PageProps<"/embed/[id]">["params"] }) {
  const { id } = await params;
  await connection();
  const db = await getDb();
  const ws = await getDefaultWorkspace(db);
  // Always as a signed-out reader: an embed must never show more than the public can see.
  const doc = await getSopDocument(db, { userId: null, name: "Embed", username: null, role: "public", workspaceId: ws!.id }, id).catch(() => null);
  if (!doc || doc.version.isDraft) return <EmbedMessage>This SOP isn't public. Embed a share link instead.</EmbedMessage>;
  await recordAnonymousView(db, ws!.id, id, doc.version.id, "embed");
  return <EmbeddedSop doc={doc} href={`/sops/${id}`} />;
}
