import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getContext, getActor } from "@/server/context";
import { atLeast } from "@/server/permissions";
import { listFolders } from "@/server/services/folders";
import { listSops } from "@/server/services/sops";
import { unreadCount } from "@/server/services/notifications";
import { openTrainingCount } from "@/server/services/training";
import { FolderTree, NavIcons, NavLink } from "@/components/shell/nav";
import { PaletteButton, ShellFrame } from "@/components/shell/frame";
import { CommandPalette } from "@/components/shell/palette";
import { UserMenu } from "@/components/shell/user-menu";
import { TabBar } from "@/components/shell/tab-bar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ShellFrame
      nav={<Nav />}
      tabs={
        <Suspense>
          <Tabs />
        </Suspense>
      }
    >
      {children}
      <Suspense>
        <Palette />
      </Suspense>
    </ShellFrame>
  );
}

function Nav() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
      <Link href="/sops" className="flex items-center gap-2.5 px-2 text-[15px] font-[510] tracking-[-0.012em] text-fg-hi">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/hcc-mark.png" alt="" className="size-[22px] [[data-theme=light]_&]:invert" />
        HCC Production
      </Link>
      <PaletteButton />
      <Suspense fallback={<NavSkeleton />}>
        <NavContent />
      </Suspense>
    </div>
  );
}

async function NavContent() {
  const { db, actor } = await getContext();
  const [folders, sops, unread, training] = await Promise.all([listFolders(db, actor), listSops(db, actor), unreadCount(db, actor), openTrainingCount(db, actor)]);
  const counts = new Map<string, number>();
  for (const s of sops) counts.set(s.folderId, (counts.get(s.folderId) ?? 0) + 1);
  const editor = atLeast(actor, "editor");
  const reviewsDue = editor ? sops.filter((s) => s.reviewState === "overdue" || s.reviewState === "due").length : 0;
  return (
    <>
      <nav className="grid gap-px" aria-label="Main">
        {actor.userId && (
          <>
            <NavLink href="/" icon={NavIcons.home} exact>
              Home
            </NavLink>
            <NavLink href="/inbox" icon={NavIcons.inbox}>
              <Counted count={unread}>Inbox</Counted>
            </NavLink>
            {editor && (
              <>
                <Sep />
                <NavLink href="/tasks" icon={NavIcons.tasks}>
                  Tasks
                </NavLink>
              </>
            )}
            <Sep />
            <NavLink href="/projects" icon={NavIcons.projects}>
              Projects
            </NavLink>
            <NavLink href="/runs" icon={NavIcons.runs}>
              Runs
            </NavLink>
            {editor && (
              <NavLink href="/contractors" icon={NavIcons.contractors}>
                Contractors
              </NavLink>
            )}
            <NavLink href="/roster" icon={NavIcons.roster}>
              Roster
            </NavLink>
            <Sep />
            <NavLink href="/training" icon={NavIcons.training}>
              <Counted count={training}>Training</Counted>
            </NavLink>
          </>
        )}
        {editor && (
          <>
            <Sep />
            <NavLink href="/gear" icon={NavIcons.gear}>
              Gear
            </NavLink>
            <NavLink href="/reviews" icon={NavIcons.reviews}>
              <Counted count={reviewsDue}>Reviews</Counted>
            </NavLink>
            <NavLink href="/purchasing" icon={NavIcons.purchasing}>
              Budgets
            </NavLink>
            <Sep />
            <NavLink href="/snippets" icon={NavIcons.snippets}>
              Snippets
            </NavLink>
            <NavLink href="/analytics" icon={NavIcons.analytics}>
              Analytics
            </NavLink>
          </>
        )}
      </nav>
      <nav aria-label="SOPs" className="grid gap-px">
        <div className="mb-1 flex items-center justify-between px-2.5 text-xs font-[510] text-muted">
          SOPs
          {atLeast(actor, "admin") && (
            <Link href="/admin/folders" className="text-faint hover:text-fg-2">
              Manage
            </Link>
          )}
        </div>
        <NavLink href="/sops" icon={NavIcons.library} exact>
          All SOPs
        </NavLink>
        <FolderTree folders={folders.map((f) => ({ id: f.id, name: f.name, depth: f.depth, count: counts.get(f.id) ?? 0 }))} />
      </nav>
      <div className="mt-auto border-t border-line pt-3">
        <UserMenu user={actor.userId ? { name: actor.name, role: actor.role } : null} />
      </div>
    </>
  );
}

async function Tabs() {
  const { db, actor } = await getContext();
  if (!actor.userId) return null;
  return (
    <TabBar
      tabs={[
        { href: "/", label: "Home", icon: "home" },
        { href: "/sops", label: "SOPs", icon: "sops" },
        { href: "/projects", label: "Projects", icon: "projects" },
        { href: "/roster", label: "Roster", icon: "roster" },
        { href: "/inbox", label: "Inbox", icon: "inbox", count: await unreadCount(db, actor) },
      ]}
    />
  );
}

async function Palette() {
  const actor = await getActor();
  return <CommandPalette canCreate={atLeast(actor, "editor")} signedIn={Boolean(actor.userId)} />;
}

/** A thin rule between groups of links. */
function Sep() {
  return <div role="separator" className="mx-2.5 my-1.5 border-t border-line" />;
}

function Counted({ count, children }: { count: number; children: ReactNode }) {
  return (
    <span className="flex w-full items-center justify-between gap-2">
      <span className="truncate">{children}</span>
      {count > 0 && <span className="rounded-full bg-wash px-1.5 font-mono text-[11px] leading-[18px] text-fg-hi">{count}</span>}
    </span>
  );
}

function NavSkeleton() {
  return (
    <div className="grid gap-2 px-2.5" aria-hidden>
      {[70, 50, 0, 60, 80, 55, 65].map((w, i) => (
        <div key={i} className="h-4 rounded bg-wash-2" style={{ width: `${w}%`, opacity: w ? 1 : 0 }} />
      ))}
    </div>
  );
}
