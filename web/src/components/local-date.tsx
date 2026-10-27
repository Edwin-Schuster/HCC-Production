"use client";

import { useId } from "react";
import { formatDate, formatDateTime } from "@/lib/format";

/** Shows a date in the reader's time zone without a hydration flash (inline script on hard loads, client render on soft ones). */
export function LocalDate({ iso, withTime = false, className }: { iso: string | null | undefined; withTime?: boolean; className?: string }) {
  const id = useId();
  if (!iso) return <span className={className}>—</span>;
  const fmt = withTime ? formatDateTime(iso) : formatDate(iso);
  const opts = withTime ? '{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}' : '{month:"short",day:"numeric",year:"numeric"}';
  return (
    <>
      <time id={id} dateTime={iso} className={className} suppressHydrationWarning>
        {fmt}
      </time>
      <script dangerouslySetInnerHTML={{ __html: `(function(){var e=document.getElementById(${JSON.stringify(id)});if(e)e.textContent=new Intl.DateTimeFormat("en-US",${opts}).format(new Date(${JSON.stringify(iso)}))})()` }} />
    </>
  );
}
