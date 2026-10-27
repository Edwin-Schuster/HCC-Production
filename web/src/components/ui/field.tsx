import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[6px] border border-hair bg-wash-2 px-3 text-base text-fg-2 transition-colors placeholder:text-faint hover:border-line-2 focus:border-fg-2 focus:outline-none disabled:opacity-60 md:text-sm";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-9 appearance-auto pr-8 [&>option]:bg-surface-2", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-xs font-[510] text-muted", className)} {...props} />;
}

export function Field({ label, htmlFor, hint, error, className, children }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-bad">{error}</p> : hint ? <p className="mt-1.5 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return <kbd className={cn("rounded-[4px] border border-line bg-wash px-1.5 font-mono text-[11px] text-muted", className)} {...props} />;
}
