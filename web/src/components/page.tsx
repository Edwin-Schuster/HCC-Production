import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full px-[max(16px,env(safe-area-inset-left))] py-6 sm:px-8 sm:py-8", wide ? "max-w-[1200px]" : "max-w-[960px]", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs text-muted">{eyebrow}</div>}
        <h1 className="text-[22px] font-[510] tracking-[-0.012em] text-fg-hi sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-dashed border-line px-6 py-14 text-center">
      <p className="text-[15px] font-[510] text-fg-hi">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
