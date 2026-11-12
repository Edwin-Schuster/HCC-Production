import Link from "next/link";
import { Suspense } from "react";
import { LogIn } from "lucide-react";
import { getActor } from "@/server/context";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme";

export const SITE_LINKS: [href: string, label: string][] = [
  ["/what-we-do", "What we do"],
  ["/gear-at-hope", "Gear at Hope"],
  ["/guests", "Guests & bands"],
  ["/sops", "SOPs"],
];

/** The public site's header: brand, section links and a small Sign in (or Open app) button. */
export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-[max(16px,env(safe-area-inset-left))] pb-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-[15px] font-[510] tracking-[-0.012em] text-fg-hi">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/brand/hcc-mark.png" alt="" className="size-[22px] [[data-theme=light]_&]:invert" />
          HCC Production
        </Link>
        <nav aria-label="Site" className="ml-4 hidden items-center gap-1 md:flex">
          {SITE_LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-[6px] px-2.5 py-1 text-[13px] text-fg-2 hover:bg-wash hover:text-fg-hi">
              {label}
            </Link>
          ))}
        </nav>
        <span className="flex-1" />
        <ThemeToggle />
        <Suspense fallback={<span className="h-7 w-[74px]" />}>
          <AccountButton />
        </Suspense>
      </div>
      {/* Phones: the section links scroll sideways under the brand. */}
      <nav aria-label="Site sections" className="mx-auto flex max-w-[1100px] gap-1 overflow-x-auto px-[max(12px,env(safe-area-inset-left))] pb-2 md:hidden">
        {SITE_LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="shrink-0 rounded-full border border-line px-3 py-1 text-[13px] text-fg-2">
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

async function AccountButton() {
  const actor = await getActor();
  return actor.userId ? (
    <Button asChild size="sm" variant="primary">
      <Link href="/">Open app</Link>
    </Button>
  ) : (
    <Button asChild size="sm">
      <Link href="/login">
        <LogIn /> Sign in
      </Link>
    </Button>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-1 px-[max(16px,env(safe-area-inset-left))] py-6 pb-[max(24px,env(safe-area-inset-bottom))] text-xs text-muted sm:px-8">
        <span>HCC Production · Hope Christian Church</span>
        <span className="flex-1" />
        <Link href="/login" className="hover:text-fg-hi">
          Team sign in
        </Link>
      </div>
    </footer>
  );
}

/** Page width and padding for public pages. */
export function SitePage({ children }: { children: React.ReactNode }) {
  return <main id="main" className="mx-auto w-full max-w-[1100px] px-[max(16px,env(safe-area-inset-left))] py-8 sm:px-8 sm:py-12">{children}</main>;
}

export function SiteTitle({ title, intro }: { title: string; intro?: React.ReactNode }) {
  return (
    <header className="mb-8 max-w-[680px]">
      <h1 className="text-[28px] font-[510] leading-tight tracking-[-0.022em] text-fg-hi sm:text-[34px]">{title}</h1>
      {intro && <div className="mt-2 text-[15px] leading-relaxed text-muted">{intro}</div>}
    </header>
  );
}
