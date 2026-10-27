"use client";

import { BookOpen, ChevronRight, Folder, FolderOpen, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function NavLink({ href, icon, children, exact }: { href: string; icon?: ReactNode; children: ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [path, query] = href.split("?");
  const qFolder = new URLSearchParams(query ?? "").get("folder");
  const active = qFolder ? pathname === path && sp.get("folder") === qFolder : exact ? pathname === path && !sp.get("folder") : pathname.startsWith(path);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-[30px] items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] text-fg-2 transition-colors hover:bg-wash-2 hover:text-fg-hi [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted",
        active && "bg-wash text-fg-hi [&_svg]:text-fg-hi before:absolute before:-left-3 before:inset-y-[7px] before:w-0.5 before:rounded-full before:bg-cta",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}

export type NavFolder = { id: string; name: string; depth: number; count: number };

export function FolderTree({ folders }: { folders: NavFolder[] }) {
  const sp = useSearchParams();
  const current = sp.get("folder");
  return (
    <div className="grid gap-px">
      {folders.map((f) => (
        <div key={f.id} style={{ paddingLeft: f.depth * 14 }}>
          <NavLink href={`/sops?folder=${f.id}`} icon={current === f.id ? <FolderOpen /> : f.depth ? <ChevronRight /> : <Folder />}>
            <span className="flex w-full items-center justify-between gap-2">
              <span className="truncate">{f.name}</span>
              {f.count > 0 && <span className="font-mono text-[11px] text-faint">{f.count}</span>}
            </span>
          </NavLink>
        </div>
      ))}
    </div>
  );
}

export const NavIcons = { library: <BookOpen />, search: <Search /> };
