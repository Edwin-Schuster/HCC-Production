"use client";

import { BarChart3, BookOpen, Globe, Network, Box, House, ListTodo, ShoppingCart, CalendarClock, ChevronRight, FolderKanban, GraduationCap, HardHat, Inbox, ListChecks, Puzzle, Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
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

export type NavFolder = { id: string; name: string; parentId: string | null };
export type NavSop = { id: string; title: string; folderId: string; draft: boolean };

/**
 * The SOP library in the sidebar: each top-level folder is a heading (it opens the folder) with its SOPs
 * listed underneath; sub-folders fold open with their own SOPs.
 */
export function SopTree({ folders, sops }: { folders: NavFolder[]; sops: NavSop[] }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const currentFolder = pathname === "/sops" ? sp.get("folder") : null;
  const currentSop = pathname.match(/^\/sops\/([^/]+)/)?.[1] ?? null;
  const children = new Map<string | null, NavFolder[]>();
  for (const f of folders) children.set(f.parentId, [...(children.get(f.parentId) ?? []), f]);
  const inFolder = new Map<string, NavSop[]>();
  for (const s of [...sops].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))) inFolder.set(s.folderId, [...(inFolder.get(s.folderId) ?? []), s]);
  // A folder opens by default when you're in it, in one of its SOPs, or anywhere below it.
  const holds = (f: NavFolder): boolean =>
    f.id === currentFolder || (inFolder.get(f.id) ?? []).some((s) => s.id === currentSop) || (children.get(f.id) ?? []).some(holds);
  const roots = children.get(null) ?? [];
  return (
    <div className="grid gap-5">
      {roots.map((f) => (
        <section key={f.id} aria-label={f.name}>
          <Link
            href={`/sops?folder=${f.id}`}
            aria-current={currentFolder === f.id ? "page" : undefined}
            className={cn("block truncate rounded-[6px] px-2.5 py-1 text-[13px] font-[590] text-fg-hi hover:bg-wash-2", currentFolder === f.id && "text-iris-text")}
          >
            {f.name}
          </Link>
          <FolderBody folder={f} depth={0} inFolder={inFolder} subfolders={children} currentSop={currentSop} currentFolder={currentFolder} holds={holds} />
        </section>
      ))}
    </div>
  );
}

type BodyProps = {
  folder: NavFolder;
  depth: number;
  inFolder: Map<string, NavSop[]>;
  subfolders: Map<string | null, NavFolder[]>;
  currentSop: string | null;
  currentFolder: string | null;
  holds: (f: NavFolder) => boolean;
};

function FolderBody({ folder, depth, ...p }: BodyProps) {
  const list = p.inFolder.get(folder.id) ?? [];
  const subs = p.subfolders.get(folder.id) ?? [];
  if (!list.length && !subs.length) return null;
  return (
    <ul className="mt-0.5 grid gap-px" role="list" style={{ paddingLeft: depth ? 12 : 0 }}>
      {list.map((s) => (
        <li key={s.id}>
          <Link
            href={`/sops/${s.id}`}
            aria-current={p.currentSop === s.id ? "page" : undefined}
            className={cn(
              "flex min-h-[30px] items-center rounded-[6px] px-2.5 py-1 text-[13px] leading-snug text-fg-2 transition-colors hover:bg-wash-2 hover:text-fg-hi",
              s.draft && "italic text-muted",
              p.currentSop === s.id && "bg-info-soft text-iris-text hover:bg-info-soft hover:text-iris-text",
            )}
          >
            <span className="line-clamp-2">{s.title}</span>
          </Link>
        </li>
      ))}
      {subs.map((f) => (
        <SubFolder key={f.id} folder={f} depth={depth + 1} {...p} />
      ))}
    </ul>
  );
}

function SubFolder({ folder, depth, ...p }: BodyProps) {
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? p.holds(folder);
  return (
    <li>
      <div className={cn("flex min-h-[30px] items-center rounded-[6px] text-[13px] text-fg-2 hover:bg-wash-2", p.currentFolder === folder.id && "text-iris-text")}>
        <Link href={`/sops?folder=${folder.id}`} aria-current={p.currentFolder === folder.id ? "page" : undefined} className="min-w-0 truncate py-1 pl-2.5 hover:text-fg-hi">
          {folder.name}
        </Link>
        <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} ${folder.name}`} onClick={() => setOpen(!expanded)} className="grid size-7 shrink-0 place-items-center text-muted hover:text-fg-hi">
          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
      </div>
      {expanded && <FolderBody folder={folder} depth={depth} {...p} />}
    </li>
  );
}

export const NavIcons = { home: <House />, tasks: <ListTodo />, library: <BookOpen />, search: <Search />, snippets: <Puzzle />, inbox: <Inbox />, reviews: <CalendarClock />, runs: <ListChecks />, analytics: <BarChart3 />, training: <GraduationCap />, roster: <Users />, projects: <FolderKanban />, gear: <Box />, contractors: <HardHat />, purchasing: <ShoppingCart />, site: <Globe />, network: <Network /> };
