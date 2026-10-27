"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProjectTabs({ base, tabs }: { base: string; tabs: [slug: string, label: string][] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1" aria-label="Project">
      {tabs.map(([slug, label]) => {
        const href = slug ? `${base}/${slug}` : base;
        const active = slug ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("relative whitespace-nowrap px-2.5 py-2 text-[13px] text-muted hover:text-fg-hi", active && "text-fg-hi after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-cta")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
