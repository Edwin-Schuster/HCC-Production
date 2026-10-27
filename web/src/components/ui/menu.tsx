"use client";

import { DropdownMenu as M } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuSeparator = (p: ComponentProps<typeof M.Separator>) => <M.Separator className="my-1 h-px bg-line" {...p} />;

export function MenuContent({ className, ...props }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={6}
        className={cn("z-50 min-w-48 rounded-[8px] border border-line-2 bg-surface-2 p-1 text-[13px] text-fg-2 shadow-lg", className)}
        {...props}
      />
    </M.Portal>
  );
}

export function MenuItem({ className, danger, ...props }: ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-[4px] px-2 py-1.5 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-wash data-[highlighted]:text-fg-hi [&_svg]:size-3.5 [&_svg]:text-muted",
        danger && "text-bad data-[highlighted]:text-bad [&_svg]:text-bad",
        className,
      )}
      {...props}
    />
  );
}
