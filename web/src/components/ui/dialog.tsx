"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, title, description, children, wide, ...props }: ComponentProps<typeof D.Content> & { title: ReactNode; description?: ReactNode; wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "fixed z-50 flex max-h-[92vh] w-full flex-col rounded-t-[12px] border border-line bg-surface-2 shadow-lg focus:outline-none",
          "bottom-0 left-0 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[12px]",
          wide ? "sm:w-[min(760px,calc(100vw-32px))]" : "sm:w-[min(480px,calc(100vw-32px))]",
          className,
        )}
        {...props}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <D.Title className="text-[15px] font-[510] text-fg-hi">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-[13px] text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="-mr-1.5 grid size-7 place-items-center rounded-[6px] text-muted hover:bg-wash hover:text-fg-hi" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
