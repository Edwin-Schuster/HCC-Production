import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { Lock } from "lucide-react";
import { getDb } from "@/db";
import { SopBody } from "@/blocks/render";
import { outline, totalDuration } from "@/blocks/tree";
import { brandScope } from "@/server/services/branding";
import { openShare } from "@/server/services/shares";
import { MetaHeader } from "@/components/sop/meta-header";
import { Toc } from "@/components/sop/toc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export const metadata: Metadata = { title: "Shared SOP", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The page behind a share link: the SOP and nothing else, no sign-in. */
export default function SharePage(props: PageProps<"/s/[token]">) {
  return (
    <Suspense>
      <Shared params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Shared({ params, searchParams }: { params: PageProps<"/s/[token]">["params"]; searchParams: PageProps<"/s/[token]">["searchParams"] }) {
  const [{ token }, sp, jar] = await Promise.all([params, searchParams, cookies()]);
  await connection();
  const state = await openShare(await getDb(), token, jar.get("hcc_share")?.value, { count: true });

  if (state.status === "missing")
    return (
      <Center>
        <p className="text-[15px] font-[510] text-fg-hi">This link doesn't work any more</p>
        <p className="mt-1.5 text-[13px] text-muted">It may have expired or been switched off. Ask the person who sent it for a new one.</p>
      </Center>
    );
  if (state.status === "locked")
    return (
      <Center>
        <Lock className="mx-auto size-5 text-muted" />
        <p className="mt-3 text-[15px] font-[510] text-fg-hi">{state.label || "This SOP"} is password protected</p>
        <form method="post" action={`/s/${token}/unlock`} className="mt-5 flex gap-2">
          <Input type="password" name="password" required autoFocus placeholder="Password" aria-label="Password" />
          <Button type="submit" variant="primary">
            Open
          </Button>
        </form>
        {sp.wrong && <p className="mt-3 text-[13px] text-bad">That password isn't right.</p>}
      </Center>
    );

  const { doc } = state;
  const items = outline(doc.blocks);
  return (
    <div className="mx-auto flex w-full max-w-[1120px] gap-12 px-[max(16px,env(safe-area-inset-left))] py-8 sm:px-8 sm:py-12">
      <article className="min-w-0 max-w-[740px] flex-1" {...brandScope(doc.branding)}>
        <MetaHeader doc={doc} totalMinutes={totalDuration(doc.blocks)} />
        <div className="mt-8">
          <SopBody blocks={doc.blocks} roles={doc.roles} snippets={doc.snippets} />
        </div>
        {doc.branding.footerText && <p className="mt-12 border-t border-line pt-4 text-xs text-muted">{doc.branding.footerText}</p>}
        <p className="mt-10 text-xs text-faint print:hidden">Shared from HCC Production. You are reading a published version of this SOP.</p>
      </article>
      <aside className="sticky top-10 hidden max-h-[calc(100dvh-80px)] w-[220px] shrink-0 self-start overflow-y-auto xl:block">
        <Toc items={items} />
      </aside>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-sm px-6 py-24 text-center">{children}</div>;
}
