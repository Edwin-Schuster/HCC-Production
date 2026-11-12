import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BookOpen, Boxes, Clapperboard, Mic2 } from "lucide-react";
import { getContext } from "@/server/context";
import { siteText } from "@/server/services/public-site";
import { Markdown } from "@/components/markdown";
import { SitePage } from "@/components/site/site-header";

export const metadata: Metadata = { title: { absolute: "HCC Production" }, description: "Sound, video, livestream, lighting and event support for Hope Christian Church." };

const SECTIONS = [
  { href: "/what-we-do", title: "What we do", body: "Sunday services, livestreams, conferences, concerts and ministry events.", icon: Clapperboard },
  { href: "/gear-at-hope", title: "Gear at Hope", body: "What's in each room, stage plots and a downloadable tech packet.", icon: Boxes },
  { href: "/guests", title: "For guest presenters & bands", body: "Slide and video formats, what we provide, and what to send ahead.", icon: Mic2 },
  { href: "/sops", title: "SOPs", body: "Our public step-by-step guides for running the systems.", icon: BookOpen },
];

/** The public home page. Signed-out visitors to / see this; signed-in staff see the app's home. */
export default function Welcome() {
  return (
    <SitePage>
      <Suspense fallback={<div className="h-48" />}>
        <Hero />
      </Suspense>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2" role="list" aria-label="Sections">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="group flex h-full flex-col gap-3 rounded-[12px] border border-line bg-surface p-5 transition-colors hover:border-line-2 hover:bg-surface-2 sm:p-6">
              <s.icon className="size-6 text-muted group-hover:text-fg-hi" aria-hidden />
              <span className="text-[18px] font-[510] text-fg-hi">{s.title}</span>
              <span className="text-[14px] text-muted">{s.body}</span>
              <span className="mt-auto inline-flex items-center gap-1 text-[13px] text-fg-2 group-hover:text-fg-hi">
                Open <ArrowRight className="size-3.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SitePage>
  );
}

async function Hero() {
  const { db, actor } = await getContext();
  const text = await siteText(db, actor);
  return (
    <section className="max-w-[720px] pt-2 sm:pt-8">
      <h1 className="text-[34px] font-[510] leading-[1.1] tracking-[-0.022em] text-fg-hi sm:text-[48px]">{text.heroTitle}</h1>
      <Markdown source={text.heroIntro} className="mt-4 text-[16px] leading-relaxed sm:text-[18px] [&_strong]:text-fg-hi" />
    </section>
  );
}
