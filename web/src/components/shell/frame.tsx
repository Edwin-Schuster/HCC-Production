"use client";

import { Menu as MenuIcon, Search } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/field";
import { openPalette } from "./palette-bus";

/** Desktop: fixed left rail. Phone: top bar + slide-over nav. */
export function ShellFrame({ nav, tabs, children }: { nav: ReactNode; tabs?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:pl-[232px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-bg lg:flex print:hidden">{nav}</aside>
      <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-line bg-bg/90 px-[max(12px,env(safe-area-inset-left))] backdrop-blur lg:hidden print:hidden">
        <D.Root open={open} onOpenChange={setOpen}>
          <D.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open navigation">
              <MenuIcon />
            </Button>
          </D.Trigger>
          <D.Portal>
            <D.Overlay className="fixed inset-0 z-40 bg-black/60" />
            <D.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(84vw,300px)] flex-col border-r border-line bg-bg shadow-lg focus:outline-none">
              <D.Title className="sr-only">Navigation</D.Title>
              <D.Description className="sr-only">Folders and pages</D.Description>
              {/* Close the slide-over when any link inside it is followed. */}
              <div className="contents" onClickCapture={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
                {nav}
              </div>
            </D.Content>
          </D.Portal>
        </D.Root>
        <Link href="/sops" className="flex items-center gap-2 text-sm font-[510] text-fg-hi">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/brand/hcc-mark.png" alt="" className="size-5 [[data-theme=light]_&]:invert" />
          HCC Production
        </Link>
        <span className="flex-1" />
        <Button variant="ghost" size="icon" aria-label="Search" onClick={openPalette}>
          <Search />
        </Button>
      </header>
      <main id="main" className="min-w-0">
        {children}
      </main>
      {tabs}
    </div>
  );
}

export function PaletteButton() {
  return (
    <button
      type="button"
      onClick={openPalette}
      className="flex h-8 w-full items-center gap-2 rounded-[6px] border border-hair bg-wash-2 px-2.5 text-[13px] text-muted transition-colors hover:border-line-2 hover:text-fg-2"
    >
      <Search className="size-3.5" />
      <span className="flex-1 text-left">Search or jump to…</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}
