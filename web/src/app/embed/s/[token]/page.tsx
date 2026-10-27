import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db";
import { openShare } from "@/server/services/shares";
import { EmbeddedSop, EmbedMessage } from "@/components/sop/embedded-sop";

export const metadata: Metadata = { title: "SOP", robots: { index: false } };

/** Embeds the SOP behind a share link. Password-protected links can't be embedded. */
export default function EmbedSharePage(props: PageProps<"/embed/s/[token]">) {
  return (
    <Suspense>
      <Embed params={props.params} />
    </Suspense>
  );
}

async function Embed({ params }: { params: PageProps<"/embed/s/[token]">["params"] }) {
  const { token } = await params;
  await connection();
  const state = await openShare(await getDb(), token, undefined, { count: true });
  if (state.status === "missing") return <EmbedMessage>This link doesn't work any more.</EmbedMessage>;
  if (state.status === "locked") return <EmbedMessage>This SOP is password protected. Open the link to read it.</EmbedMessage>;
  return <EmbeddedSop doc={state.doc} href={`/s/${token}`} />;
}
