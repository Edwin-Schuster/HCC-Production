import type { Metadata } from "next";
import { Suspense } from "react";
import { getContext } from "@/server/context";
import { publicServiceCards } from "@/server/services/public-site";
import { SitePage, SiteTitle } from "@/components/site/site-header";

export const metadata: Metadata = { title: "What we do" };

export default function WhatWeDo() {
  return (
    <SitePage>
      <SiteTitle title="What we do" intro="The production team behind Hope's services, ministries and events." />
      <Suspense fallback={<div className="h-96" />}>
        <Services />
      </Suspense>
    </SitePage>
  );
}

async function Services() {
  const { db, actor } = await getContext();
  const services = await publicServiceCards(db, actor);
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label="Services">
      {services.map((s) => (
        <li key={s.id} className="overflow-hidden rounded-[12px] border border-line bg-surface">
          {s.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- an uploaded photo
            <img src={s.photoUrl} alt="" className="aspect-[16/9] w-full border-b border-line object-cover" loading="lazy" />
          )}
          <div className="p-5">
            <h2 className="text-[16px] font-[510] text-fg-hi">{s.title}</h2>
            {s.body && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{s.body}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
