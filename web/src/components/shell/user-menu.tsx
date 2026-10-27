"use client";

import { FolderCog, KeyRound, LogIn, LogOut, Palette, ScrollText, Users } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";

export function UserMenu({ user }: { user: { name: string; role: string } | null }) {
  if (!user) {
    return (
      <div className="flex items-center gap-1">
        <Button asChild variant="primary" size="sm" className="flex-1">
          <Link href="/login">
            <LogIn /> Sign in
          </Link>
        </Button>
        <ThemeToggle />
      </div>
    );
  }
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex items-center gap-1">
      <Menu>
        <MenuTrigger className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left hover:bg-wash-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-[510] text-fg-2">{initials}</span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13px] text-fg-hi">{user.name}</span>
            <span className="block text-xs capitalize text-muted">{user.role}</span>
          </span>
        </MenuTrigger>
        <MenuContent align="start" side="top">
          <MenuItem asChild>
            <Link href="/profile">
              <KeyRound /> Profile & password
            </Link>
          </MenuItem>
          {user.role === "admin" && (
            <>
              <MenuItem asChild>
                <Link href="/admin/folders">
                  <FolderCog /> Folders
                </Link>
              </MenuItem>
              <MenuItem asChild>
                <Link href="/admin/people">
                  <Users /> People & roles
                </Link>
              </MenuItem>
              <MenuItem asChild>
                <Link href="/admin/branding">
                  <Palette /> Branding
                </Link>
              </MenuItem>
              <MenuItem asChild>
                <Link href="/admin/audit">
                  <ScrollText /> Audit log
                </Link>
              </MenuItem>
            </>
          )}
          <MenuSeparator />
          <MenuItem onSelect={() => logout()}>
            <LogOut /> Sign out
          </MenuItem>
        </MenuContent>
      </Menu>
      <ThemeToggle />
    </div>
  );
}
