"use client";

import { BookOpen, FolderKanban, Home, Inbox, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ICONS = { home: Home, sops: BookOpen, projects: FolderKanban, inbox: Inbox, roster: Users } as const;

/** Phone navigation along the bottom edge, thumb-reachable. Hidden on desktop and in print. */
export function TabBar({ tabs }: { tabs: { href: string; label: string; icon: keyof typeof ICONS; count?: number }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden">
      {tabs.map((t) => {
        const Icon = ICONS[t.icon];
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10.5px]", active ? "text-fg-hi" : "text-muted")}>
            <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
            {t.label}
            {!!t.count && <span className="absolute right-[calc(50%-18px)] top-1 rounded-full bg-cta px-1 font-mono text-[9.5px] leading-[14px] text-cta-ink">{t.count > 99 ? "99+" : t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
