import type { Metadata } from "next";
import { Suspense } from "react";
import { getContext } from "@/server/context";
import { siteText } from "@/server/services/public-site";
import { Markdown } from "@/components/markdown";
import { SitePage, SiteTitle } from "@/components/site/site-header";

export const metadata: Metadata = { title: "For guest presenters & bands" };

export default function Guests() {
  return (
    <SitePage>
      <SiteTitle title="For guest presenters & bands" intro="Everything you need to know before you arrive." />
      <Suspense fallback={<div className="h-96" />}>
        <Body />
      </Suspense>
    </SitePage>
  );
}

async function Body() {
  const { db, actor } = await getContext();
  const text = await siteText(db, actor);
  return <Markdown source={text.guestsBody} className="max-w-[720px] text-[15px] [&_h2]:mt-8 [&_h2]:text-[18px] [&_h2:first-child]:mt-0" />;
}
